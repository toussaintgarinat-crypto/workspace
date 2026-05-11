import hashlib
import os
import aiosqlite
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config import settings


def _key() -> bytes:
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
    from db import DB_PATH
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT app_type, expires_at FROM user_tokens WHERE user_sub = ?",
            (user_sub,),
        ) as cur:
            rows = await cur.fetchall()
    return [{"app_type": r["app_type"], "expires_at": r["expires_at"], "connected": True} for r in rows]


async def get_vault_token(user_sub: str, app_type: str) -> str | None:
    from db import DB_PATH
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT access_token_enc FROM user_tokens WHERE user_sub = ? AND app_type = ?",
            (user_sub, app_type),
        ) as cur:
            row = await cur.fetchone()
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
    from db import DB_PATH
    enc_access = encrypt(access_token)
    enc_refresh = encrypt(refresh_token) if refresh_token else None
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO user_tokens (user_sub, app_type, access_token_enc, refresh_token_enc, expires_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_sub, app_type) DO UPDATE SET
                access_token_enc = excluded.access_token_enc,
                refresh_token_enc = excluded.refresh_token_enc,
                expires_at = excluded.expires_at
            """,
            (user_sub, app_type, enc_access, enc_refresh, expires_at),
        )
        await db.commit()


async def delete_vault_token(user_sub: str, app_type: str):
    from db import DB_PATH
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM user_tokens WHERE user_sub = ? AND app_type = ?",
            (user_sub, app_type),
        )
        await db.commit()
