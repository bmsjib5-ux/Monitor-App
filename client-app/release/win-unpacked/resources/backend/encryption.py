"""
Encryption utilities for MonitorApp using Fernet symmetric encryption.
Fernet guarantees that data encrypted using it cannot be manipulated
or read without the key (AES-128-CBC + HMAC-SHA256).
"""
import logging
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# Master key file location (same directory as this module)
MASTER_KEY_FILE = Path(__file__).parent / "master.key"

# Prefix to identify encrypted values
ENC_PREFIX = "ENC:"

# Cached Fernet instance
_fernet: Fernet = None


def _load_or_create_key() -> bytes:
    """Load master key from file, or generate a new one if missing."""
    if MASTER_KEY_FILE.exists():
        key = MASTER_KEY_FILE.read_bytes().strip()
        logger.info("Master encryption key loaded")
    else:
        key = Fernet.generate_key()
        MASTER_KEY_FILE.write_bytes(key)
        logger.warning(f"Generated new master encryption key at {MASTER_KEY_FILE}")
        logger.warning("Back up this file securely. If lost, encrypted values cannot be recovered.")
    return key


def get_fernet() -> Fernet:
    """Get cached Fernet instance (lazy initialization)."""
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_load_or_create_key())
    return _fernet


def encrypt(value: str) -> str:
    """Encrypt a plaintext string.

    Returns string in format 'ENC:<base64-encoded-ciphertext>'.
    If value is empty, returns empty string.
    """
    if not value:
        return value
    token = get_fernet().encrypt(value.encode("utf-8"))
    return ENC_PREFIX + token.decode("utf-8")


def decrypt(value: str) -> str:
    """Decrypt an encrypted string.

    If value doesn't start with 'ENC:' prefix, returns it as-is (plaintext passthrough).
    This allows gradual migration from plaintext to encrypted values.
    """
    if not value or not value.startswith(ENC_PREFIX):
        return value
    try:
        token = value[len(ENC_PREFIX):]
        return get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.error("Failed to decrypt value - invalid token or wrong master key")
        return value
    except Exception as e:
        logger.error(f"Decryption error: {e}")
        return value


def is_encrypted(value: str) -> bool:
    """Check if a value is encrypted (has ENC: prefix)."""
    return bool(value) and value.startswith(ENC_PREFIX)
