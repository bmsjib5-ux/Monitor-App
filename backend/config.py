from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import model_validator

# Find .env file - check backend dir first, then parent (project root)
_backend_dir = Path(__file__).parent
_env_file = _backend_dir / ".env"
if not _env_file.exists():
    _env_file = _backend_dir.parent / ".env"
_ENV_FILE_PATH = str(_env_file) if _env_file.exists() else ".env"

class Settings(BaseSettings):
    # Application settings
    app_name: str = "Windows Application Monitor"
    app_version: str = "4.0.60"

    # Server settings
    host: str = "0.0.0.0"
    port: int = 3001

    # Monitoring settings
    update_interval: int = 2  # seconds
    history_length: int = 60  # keep last 60 data points

    # Resource thresholds
    cpu_threshold: float = 80.0  # percentage
    ram_threshold: float = 80.0  # percentage
    disk_io_threshold: float = 100.0  # MB/s
    network_threshold: float = 50.0  # MB/s

    # Logging
    log_file: str = "logs/monitor.log"
    log_level: str = "INFO"

    # CORS - restricted to known origins only
    cors_origins: list = [
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # MySQL Database settings (loaded from environment)
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_user: str = "sa"
    db_password: str = "sa"
    db_name: str = "monitor_app"

    # Supabase settings (loaded from environment)
    supabase_url: str = ""
    supabase_key: str = ""
    use_supabase: bool = True

    # JWT settings
    jwt_secret_key: str = ""  # MUST be set in .env
    jwt_expiration_hours: int = 8

    # Admin credentials
    admin_username: str = ""  # MUST be set in .env
    admin_password: str = ""  # MUST be set in .env
    admin_password_hash: str = ""
    admin_password_plain: str = ""  # Fallback when encryption unavailable

    # Plaintext fallbacks (used when cryptography package not installed)
    db_password_plain: str = ""
    db_host_plain: str = ""
    supabase_key_plain: str = ""
    jwt_secret_key_plain: str = ""

    # Security settings
    rate_limit_login_max: int = 5  # max login attempts
    rate_limit_login_window: int = 300  # window in seconds (5 min)
    max_request_body_size: int = 1048576  # 1MB max request body

    # TLS/SSL (optional - set paths in .env for HTTPS)
    ssl_certfile: str = ""
    ssl_keyfile: str = ""

    @model_validator(mode='after')
    def decrypt_sensitive_fields(self):
        """Auto-decrypt any ENC:-prefixed values loaded from .env"""
        try:
            from encryption import decrypt
        except ImportError:
            # cryptography not installed - use _plain fallback fields
            _fallbacks = {
                'admin_password': self.admin_password_plain,
                'db_password': self.db_password_plain,
                'db_host': self.db_host_plain,
                'supabase_key': self.supabase_key_plain,
                'jwt_secret_key': self.jwt_secret_key_plain,
            }
            for field, plain_val in _fallbacks.items():
                val = getattr(self, field, '')
                if isinstance(val, str) and val.startswith('ENC:') and plain_val:
                    object.__setattr__(self, field, plain_val)
            return self
        sensitive_fields = ['db_password', 'db_host', 'supabase_key', 'jwt_secret_key', 'admin_password']
        for field in sensitive_fields:
            val = getattr(self, field, '')
            if isinstance(val, str) and val.startswith('ENC:'):
                object.__setattr__(self, field, decrypt(val))
        return self

    class Config:
        env_file = _ENV_FILE_PATH
        case_sensitive = False

settings = Settings()
