"""
Security middleware for MonitorApp.
Provides rate limiting, security headers, request size limits, and audit logging.
"""
import time
import logging
from collections import defaultdict
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from config import settings

logger = logging.getLogger("security")


# ============================================================
# Rate Limiter (in-memory, per-IP)
# ============================================================

class RateLimiter:
    """Simple in-memory rate limiter using sliding window."""

    def __init__(self):
        # {key: [timestamp, timestamp, ...]}
        self._attempts: dict[str, list[float]] = defaultdict(list)

    def is_rate_limited(self, key: str, max_attempts: int, window_seconds: int) -> bool:
        """Check if key has exceeded rate limit. Returns True if blocked."""
        now = time.time()
        cutoff = now - window_seconds
        # Remove expired entries
        self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]
        if len(self._attempts[key]) >= max_attempts:
            return True
        self._attempts[key].append(now)
        return False

    def get_remaining(self, key: str, max_attempts: int, window_seconds: int) -> int:
        """Get remaining attempts for a key."""
        now = time.time()
        cutoff = now - window_seconds
        self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]
        return max(0, max_attempts - len(self._attempts[key]))

    def reset(self, key: str):
        """Reset rate limit for a key (e.g., after successful login)."""
        self._attempts.pop(key, None)


rate_limiter = RateLimiter()


# ============================================================
# Security Headers Middleware
# ============================================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        # XSS protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissions policy - restrict sensitive features
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Content Security Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self' ws://localhost:3001 wss://localhost:3001; "
            "font-src 'self'; "
            "frame-ancestors 'none'"
        )
        # Strict Transport Security (effective when behind HTTPS proxy)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # Prevent caching of sensitive API responses
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response


# ============================================================
# Request Size Limit Middleware
# ============================================================

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests with body exceeding configured max size."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > settings.max_request_body_size:
            logger.warning(
                f"Request too large from {request.client.host}: "
                f"{content_length} bytes (max {settings.max_request_body_size})"
            )
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"}
            )
        return await call_next(request)


# ============================================================
# Security Audit Logger Middleware
# ============================================================

class SecurityAuditMiddleware(BaseHTTPMiddleware):
    """Log security-relevant events."""

    # Paths considered security-sensitive
    AUDIT_PATHS = {
        "/api/auth/login",
        "/api/auth/verify",
        "/api/database/config",
        "/api/database/test",
        "/api/database/reconnect",
        "/api/line-oa/configure",
        "/api/clear-cache",
    }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        response = await call_next(request)

        # Log security-sensitive requests
        if path in self.AUDIT_PATHS or request.method in ("DELETE", "PATCH"):
            logger.info(
                f"AUDIT: {request.method} {path} "
                f"from={client_ip} status={response.status_code}"
            )

        # Log failed auth attempts
        if path == "/api/auth/login" and response.status_code == 401:
            logger.warning(f"AUDIT: Failed login attempt from {client_ip}")

        # Log all 403/401 responses
        if response.status_code in (401, 403):
            logger.warning(
                f"AUDIT: Auth failure {response.status_code} "
                f"{request.method} {path} from={client_ip}"
            )

        return response
