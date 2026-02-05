"""
Authentication module for MonitorApp
Handles JWT token creation, verification, password hashing, and rate limiting.
"""
import re
import logging
import secrets
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
from fastapi import HTTPException, Depends, WebSocket
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Graceful imports for optional dependencies
try:
    import jwt as _jwt
    HAS_JWT = True
except ImportError:
    _jwt = None
    HAS_JWT = False

try:
    import bcrypt as _bcrypt
    HAS_BCRYPT = True
except ImportError:
    _bcrypt = None
    HAS_BCRYPT = False

from config import settings

logger = logging.getLogger(__name__)

if not HAS_JWT:
    logger.warning("PyJWT not installed - using fallback token auth (run: pip install PyJWT)")
if not HAS_BCRYPT:
    logger.warning("bcrypt not installed - using fallback password check (run: pip install bcrypt)")

# JWT config from settings (fall back to random secret if not configured)
JWT_SECRET_KEY = settings.jwt_secret_key or secrets.token_urlsafe(32)
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = settings.jwt_expiration_hours

if not settings.jwt_secret_key:
    logger.warning("JWT_SECRET_KEY not set in .env - using random key (tokens won't survive restart)")

# Admin credentials from settings
ADMIN_USERNAME = settings.admin_username

if not ADMIN_USERNAME:
    logger.error("ADMIN_USERNAME not set in .env - login will fail")

# Resolve admin password (may still be encrypted if cryptography missing)
_admin_password = settings.admin_password
_PASSWORD_STILL_ENCRYPTED = _admin_password.startswith("ENC:") if _admin_password else False
if _PASSWORD_STILL_ENCRYPTED:
    logger.warning("ADMIN_PASSWORD still encrypted (cryptography not installed) - using plain fallback")
    # config.py already sets admin_password from admin_password_plain when decrypt fails
    # Re-read in case it was resolved
    _admin_password = settings.admin_password

# Generate bcrypt hash from password if no hash provided
if settings.admin_password_hash:
    ADMIN_PASSWORD_HASH = settings.admin_password_hash
elif _admin_password and not _admin_password.startswith("ENC:") and HAS_BCRYPT:
    ADMIN_PASSWORD_HASH = _bcrypt.hashpw(
        _admin_password.encode("utf-8"), _bcrypt.gensalt()
    ).decode("utf-8")
else:
    ADMIN_PASSWORD_HASH = ""
    if _admin_password and not _admin_password.startswith("ENC:") and not HAS_BCRYPT:
        logger.warning("bcrypt not available - will use plaintext password comparison as fallback")

security = HTTPBearer(auto_error=False)


# ============================================================
# Password Complexity
# ============================================================

MIN_PASSWORD_LENGTH = 8

def validate_password_complexity(password: str) -> Optional[str]:
    """Validate password meets complexity requirements.
    Returns error message if invalid, None if valid."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    if not re.search(r'[A-Za-z]', password):
        return "Password must contain at least one letter"
    if not re.search(r'[0-9]', password):
        return "Password must contain at least one number"
    return None


# ============================================================
# Core auth functions
# ============================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash"""
    if HAS_BCRYPT:
        try:
            return _bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception:
            logger.error("Password verification error")
            return False
    else:
        # Fallback: direct comparison with admin_password from settings
        return hmac.compare_digest(plain_password, settings.admin_password)


def create_access_token(username: str) -> str:
    """Create a JWT access token"""
    import base64, json
    if HAS_JWT:
        payload = {
            "sub": username,
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        }
        return _jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    else:
        # Fallback: simple HMAC-based token
        exp = (datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)).isoformat()
        data = json.dumps({"sub": username, "exp": exp})
        data_b64 = base64.urlsafe_b64encode(data.encode()).decode()
        sig = hmac.new(JWT_SECRET_KEY.encode(), data_b64.encode(), hashlib.sha256).hexdigest()
        return f"{data_b64}.{sig}"


def verify_token(token: str) -> Optional[Dict]:
    """Verify a JWT token and return the payload"""
    import base64, json
    if HAS_JWT:
        try:
            payload = _jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            return payload
        except Exception:
            return None
    else:
        # Fallback: verify HMAC token
        try:
            parts = token.rsplit(".", 1)
            if len(parts) != 2:
                return None
            data_b64, sig = parts
            expected_sig = hmac.new(JWT_SECRET_KEY.encode(), data_b64.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, expected_sig):
                return None
            data = json.loads(base64.urlsafe_b64decode(data_b64))
            exp = datetime.fromisoformat(data["exp"])
            if exp < datetime.now(timezone.utc):
                return None
            return data
        except Exception:
            return None


def authenticate_user(username: str, password: str) -> bool:
    """Authenticate user with username and password"""
    if not ADMIN_USERNAME:
        return False
    if username != ADMIN_USERNAME:
        return False
    if ADMIN_PASSWORD_HASH and HAS_BCRYPT:
        return verify_password(password, ADMIN_PASSWORD_HASH)
    else:
        # Fallback without bcrypt
        return verify_password(password, "")


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Dict:
    """FastAPI dependency to get current authenticated user from JWT token"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    payload = verify_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return payload


async def verify_ws_token(websocket: WebSocket) -> Optional[Dict]:
    """Verify JWT token from WebSocket Sec-WebSocket-Protocol header.
    Falls back to query parameter for backward compatibility."""
    # Prefer protocol-based token (more secure than query param)
    protocols = websocket.headers.get("sec-websocket-protocol", "")
    for proto in protocols.split(","):
        proto = proto.strip()
        if proto.startswith("auth."):
            token = proto[5:]  # strip "auth." prefix
            result = verify_token(token)
            if result:
                return result

    # Fallback: query parameter (kept for backward compat, will be removed)
    token = websocket.query_params.get("token")
    if token:
        return verify_token(token)

    return None
