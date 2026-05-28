"""Fernet encrypt/decrypt pour les credentials utilisateur.

Génération de la clé :
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
import os
from cryptography.fernet import Fernet, InvalidToken

_raw_key = os.getenv("TOOLHUB_ENCRYPTION_KEY", "")
_fernet: Fernet | None = None

if _raw_key:
    try:
        _fernet = Fernet(_raw_key.encode())
    except Exception:
        pass


def encrypt(value: str) -> str:
    """Chiffre une valeur string. Lève RuntimeError si pas de clé configurée."""
    if not _fernet:
        raise RuntimeError(
            "TOOLHUB_ENCRYPTION_KEY not configured — cannot encrypt credentials. "
            "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return _fernet.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    """Déchiffre une valeur. Retourne value tel quel si pas de clé (migration legacy)."""
    if not _fernet or not value:
        return value
    try:
        return _fernet.decrypt(value.encode()).decode()
    except (InvalidToken, Exception):
        return value
