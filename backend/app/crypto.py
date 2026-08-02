"""Cifrado Fernet para credenciales de cámaras."""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from .config import SECRET_KEY_PATH


def _load_key() -> bytes:
    if SECRET_KEY_PATH.exists():
        return SECRET_KEY_PATH.read_bytes()
    key = Fernet.generate_key()
    SECRET_KEY_PATH.write_bytes(key)
    SECRET_KEY_PATH.chmod(0o600)
    return key


_fernet = Fernet(_load_key())


def encrypt(plain: str) -> str:
    if not plain:
        return ""
    return _fernet.encrypt(plain.encode()).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        return ""
