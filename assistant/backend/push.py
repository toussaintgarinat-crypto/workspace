import asyncio
import base64
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from config import settings
from db import database

logger = logging.getLogger(__name__)

_vapid = None
_public_key_b64: Optional[str] = None
_vapid_lock: asyncio.Lock = asyncio.Lock()


async def _ensure_vapid():
    global _vapid, _public_key_b64
    if _vapid is not None:
        return
    async with _vapid_lock:
        # Double-check after acquiring the lock
        if _vapid is not None:
            return

        try:
            from py_vapid import Vapid
        except ImportError:
            logger.warning("pywebpush not installed — push notifications disabled")
            return

        await database.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        row = await database.fetch_one(
            "SELECT value FROM app_settings WHERE key = 'vapid_private_pem'"
        )
        priv_pem = row["value"] if row else None

        if priv_pem:
            _vapid = Vapid.from_pem(priv_pem.encode())
        else:
            _vapid = Vapid()
            _vapid.generate_keys()
            priv_pem = _vapid.private_pem().decode()
            await database.execute(
                """
                INSERT INTO app_settings (key, value) VALUES (:key, :value)
                ON CONFLICT (key) DO UPDATE SET value = excluded.value
                """,
                {"key": "vapid_private_pem", "value": priv_pem},
            )
            logger.info("Generated new VAPID keys")

        pub_raw = _vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        _public_key_b64 = base64.urlsafe_b64encode(pub_raw).rstrip(b"=").decode()


async def get_public_key() -> Optional[str]:
    await _ensure_vapid()
    return _public_key_b64


async def save_subscription(endpoint: str, p256dh: str, auth_key: str):
    await database.execute("""
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            endpoint TEXT PRIMARY KEY,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    now = datetime.now(timezone.utc).isoformat()
    await database.execute(
        """
        INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
        VALUES (:endpoint, :p256dh, :auth, :now)
        ON CONFLICT (endpoint) DO UPDATE SET
            p256dh = excluded.p256dh,
            auth = excluded.auth
        """,
        {"endpoint": endpoint, "p256dh": p256dh, "auth": auth_key, "now": now},
    )


async def delete_subscription(endpoint: str):
    await database.execute(
        "DELETE FROM push_subscriptions WHERE endpoint = :endpoint",
        {"endpoint": endpoint},
    )


async def get_all_subscriptions() -> list[dict]:
    rows = await database.fetch_all("SELECT endpoint, p256dh, auth FROM push_subscriptions")
    return [{"endpoint": r["endpoint"], "p256dh": r["p256dh"], "auth": r["auth"]} for r in rows]


_GONE_STATUSES = (404, 410)


def _send_sync(sub: dict, payload: dict, priv_pem: str, subject: str) -> str:
    """Return 'ok', 'gone' (subscription expired — delete it), or 'error' (transient)."""
    try:
        from pywebpush import webpush
        webpush(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=json.dumps(payload),
            vapid_private_key=priv_pem,
            vapid_claims={"sub": f"mailto:{subject}"},
        )
        return "ok"
    except Exception as e:
        status = None
        if hasattr(e, "response") and e.response is not None:
            status = e.response.status_code
        if status in _GONE_STATUSES:
            logger.debug("WebPush subscription gone (HTTP %s): %s", status, sub["endpoint"])
            return "gone"
        logger.debug("WebPush transient error: %s", e)
        return "error"


async def send_push(sub: dict, payload: dict) -> str:
    """Return 'ok', 'gone', or 'error'."""
    await _ensure_vapid()
    if _vapid is None:
        return "error"
    priv_pem = _vapid.private_pem().decode()
    subject = settings.VAPID_SUBJECT or "assistant@localhost"
    return await asyncio.to_thread(_send_sync, sub, payload, priv_pem, subject)


async def send_push_to_all(payload: dict) -> int:
    subs = await get_all_subscriptions()
    if not subs:
        return 0
    gone = []
    count = 0
    for sub in subs:
        result = await send_push(sub, payload)
        if result == "ok":
            count += 1
        elif result == "gone":
            gone.append(sub["endpoint"])
        # "error" = transient failure, keep subscription
    for ep in gone:
        await delete_subscription(ep)
    return count
