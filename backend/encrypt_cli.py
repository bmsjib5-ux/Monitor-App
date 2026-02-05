"""
CLI tool to encrypt/decrypt sensitive values for MonitorApp.

Usage:
  python encrypt_cli.py env [path]    Encrypt sensitive values in .env file in-place
  python encrypt_cli.py enc <value>   Encrypt a single value
  python encrypt_cli.py dec <value>   Decrypt a single value
"""
import sys
from pathlib import Path
from encryption import encrypt, decrypt, is_encrypted

# Keys in .env that contain sensitive data and should be encrypted
SENSITIVE_KEYS = {
    "ADMIN_PASSWORD",
    "DB_PASSWORD",
    "DB_HOST",
    "SUPABASE_KEY",
    "JWT_SECRET_KEY",
}


def encrypt_env_file(env_path: str = None):
    """Encrypt sensitive values in a .env file in-place."""
    if env_path is None:
        env_path = str(Path(__file__).parent.parent / ".env")

    path = Path(env_path)
    if not path.exists():
        print(f"Error: File not found: {env_path}")
        sys.exit(1)

    lines = path.read_text(encoding="utf-8").splitlines()
    new_lines = []
    encrypted_count = 0
    skipped_count = 0

    for line in lines:
        if "=" in line and not line.strip().startswith("#"):
            key, _, value = line.partition("=")
            key_stripped = key.strip()
            value_stripped = value.strip()

            if key_stripped in SENSITIVE_KEYS:
                if is_encrypted(value_stripped):
                    skipped_count += 1
                    print(f"  [SKIP] {key_stripped} (already encrypted)")
                else:
                    encrypted_value = encrypt(value_stripped)
                    line = f"{key_stripped}={encrypted_value}"
                    encrypted_count += 1
                    print(f"  [ENC]  {key_stripped}")

        new_lines.append(line)

    path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    print(f"\nDone: {encrypted_count} encrypted, {skipped_count} skipped")
    print(f"File: {path.absolute()}")


def rotate_key(env_path: str = None):
    """Rotate master key: decrypt with old key, generate new key, re-encrypt."""
    from encryption import MASTER_KEY_FILE, Fernet
    import shutil

    if env_path is None:
        env_path = str(Path(__file__).parent.parent / ".env")

    path = Path(env_path)
    if not path.exists():
        print(f"Error: File not found: {env_path}")
        sys.exit(1)
    if not MASTER_KEY_FILE.exists():
        print("Error: No existing master.key found")
        sys.exit(1)

    # Step 1: Decrypt all values with current key
    print("Step 1: Decrypting with current key...")
    lines = path.read_text(encoding="utf-8").splitlines()
    decrypted_lines = []
    for line in lines:
        if "=" in line and not line.strip().startswith("#"):
            key, _, value = line.partition("=")
            key_stripped = key.strip()
            value_stripped = value.strip()
            if is_encrypted(value_stripped):
                plain = decrypt(value_stripped)
                line = f"{key_stripped}={plain}"
                print(f"  [DEC] {key_stripped}")
        decrypted_lines.append(line)

    # Step 2: Backup old key and generate new one
    print("Step 2: Rotating master key...")
    backup_path = MASTER_KEY_FILE.with_suffix(".key.bak")
    shutil.copy2(MASTER_KEY_FILE, backup_path)
    print(f"  Old key backed up to: {backup_path}")

    new_key = Fernet.generate_key()
    MASTER_KEY_FILE.write_bytes(new_key)
    print("  New master key generated")

    # Step 3: Reset cached fernet and re-encrypt
    import encryption
    encryption._fernet = None  # force reload

    print("Step 3: Re-encrypting with new key...")
    final_lines = []
    encrypted_count = 0
    for line in decrypted_lines:
        if "=" in line and not line.strip().startswith("#"):
            key, _, value = line.partition("=")
            key_stripped = key.strip()
            value_stripped = value.strip()
            if key_stripped in SENSITIVE_KEYS and value_stripped:
                encrypted_value = encrypt(value_stripped)
                line = f"{key_stripped}={encrypted_value}"
                encrypted_count += 1
                print(f"  [ENC] {key_stripped}")
        final_lines.append(line)

    path.write_text("\n".join(final_lines) + "\n", encoding="utf-8")
    print(f"\nKey rotation complete: {encrypted_count} values re-encrypted")
    print(f"Old key backup: {backup_path}")
    print("Delete the backup after verifying the application works correctly.")


def decrypt_env_file(env_path: str = None):
    """Decrypt all encrypted values in a .env file in-place (for debugging)."""
    if env_path is None:
        env_path = str(Path(__file__).parent.parent / ".env")

    path = Path(env_path)
    if not path.exists():
        print(f"Error: File not found: {env_path}")
        sys.exit(1)

    lines = path.read_text(encoding="utf-8").splitlines()
    new_lines = []
    decrypted_count = 0

    for line in lines:
        if "=" in line and not line.strip().startswith("#"):
            key, _, value = line.partition("=")
            key_stripped = key.strip()
            value_stripped = value.strip()

            if is_encrypted(value_stripped):
                decrypted_value = decrypt(value_stripped)
                line = f"{key_stripped}={decrypted_value}"
                decrypted_count += 1
                print(f"  [DEC]  {key_stripped}")

        new_lines.append(line)

    path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    print(f"\nDone: {decrypted_count} decrypted")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("MonitorApp Encryption CLI")
        print("=" * 40)
        print()
        print("Usage:")
        print("  python encrypt_cli.py env [path]      Encrypt sensitive values in .env file")
        print("  python encrypt_cli.py dec-env [path]  Decrypt .env file (for debugging)")
        print("  python encrypt_cli.py enc <value>     Encrypt a single value")
        print("  python encrypt_cli.py dec <value>     Decrypt a single value")
        print("  python encrypt_cli.py rotate [path]   Rotate master key & re-encrypt .env")
        print()
        print(f"Sensitive keys: {', '.join(sorted(SENSITIVE_KEYS))}")
        sys.exit(0)

    cmd = sys.argv[1]

    if cmd == "env":
        env_file = sys.argv[2] if len(sys.argv) > 2 else None
        print("Encrypting .env file...")
        encrypt_env_file(env_file)

    elif cmd == "rotate":
        env_file = sys.argv[2] if len(sys.argv) > 2 else None
        print("Rotating master encryption key...")
        rotate_key(env_file)

    elif cmd == "dec-env":
        env_file = sys.argv[2] if len(sys.argv) > 2 else None
        print("Decrypting .env file...")
        decrypt_env_file(env_file)

    elif cmd == "enc":
        if len(sys.argv) < 3:
            print("Error: Please provide a value to encrypt")
            sys.exit(1)
        result = encrypt(sys.argv[2])
        print(result)

    elif cmd == "dec":
        if len(sys.argv) < 3:
            print("Error: Please provide a value to decrypt")
            sys.exit(1)
        result = decrypt(sys.argv[2])
        print(result)

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
