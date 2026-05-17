import hashlib
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config import settings
from db import database


def _key() -> bytes:
    if not settings.VAULT_SECRET:
        raise RuntimeError("VAULT_SECRET is not set — configure it before storing encrypted tokens")
    return hashlib.sha256(settings.VAULT_SECRET.encode()).digest()


def encrypt(plaintext: str) -> bytes:
    aesgcm = AESGCM(_key())
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return nonce + ct


def decrypt(data: bytes) -> str:
    aesgcm = AESGCM(_key())
    return aesgcm.decrypt(bytes(data)[:12], bytes(data)[12:], None).decode()


async def list_vault(user_sub: str) -> list[dict]:
    rows = await database.fetch_all(
        "SELECT app_type, expires_at FROM user_tokens WHERE user_sub = :user_sub",
        {"user_sub": user_sub},
    )
    return [{"app_type": r["app_type"], "expires_at": r["expires_at"], "connected": True} for r in rows]


async def get_vault_token(user_sub: str, app_type: str) -> str | None:
    row = await database.fetch_one(
        "SELECT access_token_enc FROM user_tokens WHERE user_sub = :user_sub AND app_type = :app_type",
        {"user_sub": user_sub, "app_type": app_type},
    )
    if not row or not row["access_token_enc"]:
        return None
    try:
        return decrypt(row["access_token_enc"])
    except Exception:
        return None


async def upsert_vault_token(
    user_sub: str,
    app_type: str,
    access_token: str,
    refresh_token: str | None = None,
    expires_at: str | None = None,
):
    enc_access = encrypt(access_token)
    enc_refresh = encrypt(refresh_token) if refresh_token else None
    await database.execute(
        """
        INSERT INTO user_tokens (user_sub, app_type, access_token_enc, refresh_token_enc, expires_at)
        VALUES (:user_sub, :app_type, :access_token_enc, :refresh_token_enc, :expires_at)
        ON CONFLICT (user_sub, app_type) DO UPDATE SET
            access_token_enc = excluded.access_token_enc,
            refresh_token_enc = excluded.refresh_token_enc,
            expires_at = excluded.expires_at
        """,
        {
            "user_sub": user_sub, "app_type": app_type,
            "access_token_enc": enc_access, "refresh_token_enc": enc_refresh,
            "expires_at": expires_at,
        },
    )


async def delete_vault_token(user_sub: str, app_type: str):
    await database.execute(
        "DELETE FROM user_tokens WHERE user_sub = :user_sub AND app_type = :app_type",
        {"user_sub": user_sub, "app_type": app_type},
    )
