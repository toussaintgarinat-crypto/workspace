"""Wrapper async Redis paramétrable.

Caractéristiques :
- `init_redis(redis_url)` : initialise un client global, dégradation gracieuse si absent.
- `get_client(namespace=None)` : renvoie un proxy qui préfixe automatiquement les clés.
- `lock(key, ttl)` : context manager async pour SET NX EX (leader election / mutex distribué).
- `publish(channel, payload)` : helper pubsub (sérialise dict → json automatiquement).

L'import de `redis.asyncio` est paresseux pour rester compatible avec les services
qui ne déclarent pas la dépendance (ex: mempalace utilise le mode dégradé).
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Singleton global — partagé par tout le service hôte.
_client: Optional[Any] = None


async def init_redis(redis_url: str = "") -> bool:
    """Initialise le client Redis global. Retourne True si connecté."""
    global _client
    if not redis_url:
        logger.info("REDIS_URL not set — single-instance mode (no Redis)")
        return False
    try:
        import redis.asyncio as aioredis  # type: ignore
        _client = aioredis.from_url(redis_url, decode_responses=True)
        await _client.ping()
        logger.info("Redis connected: %s", redis_url)
        return True
    except Exception as exc:
        logger.warning("Redis unavailable (%s) — falling back to single-instance mode", exc)
        _client = None
        return False


async def close_redis() -> None:
    """Ferme proprement le client Redis global."""
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception as exc:
            logger.warning("Error closing Redis client: %s", exc)
        _client = None


def get_raw_client() -> Optional[Any]:
    """Renvoie le client brut (None si Redis indisponible)."""
    return _client


class _NamespacedClient:
    """Proxy qui préfixe automatiquement les clés avec `namespace:`."""

    def __init__(self, client: Any, namespace: str) -> None:
        self._client = client
        self._prefix = f"{namespace}:" if namespace and not namespace.endswith(":") else namespace

    def _k(self, key: str) -> str:
        if not self._prefix or key.startswith(self._prefix):
            return key
        return f"{self._prefix}{key}"

    async def get(self, key: str) -> Any:
        return await self._client.get(self._k(key))

    async def set(self, key: str, value: Any, **kwargs: Any) -> Any:
        return await self._client.set(self._k(key), value, **kwargs)

    async def setex(self, key: str, ttl: int, value: Any) -> Any:
        return await self._client.setex(self._k(key), ttl, value)

    async def delete(self, *keys: str) -> Any:
        return await self._client.delete(*(self._k(k) for k in keys))

    async def publish(self, channel: str, payload: Any) -> Any:
        if not isinstance(payload, (str, bytes)):
            payload = json.dumps(payload)
        return await self._client.publish(self._k(channel), payload)

    def pubsub(self) -> Any:
        return self._client.pubsub()

    def __getattr__(self, item: str) -> Any:
        # Fallback : on délègue au client réel pour tout le reste de l'API redis.asyncio.
        return getattr(self._client, item)


def get_client(namespace: str = "") -> Optional[Any]:
    """Renvoie un client (potentiellement namespacé). None si Redis indisponible."""
    if _client is None:
        return None
    if not namespace:
        return _client
    return _NamespacedClient(_client, namespace)


@asynccontextmanager
async def lock(key: str, ttl: int = 30):
    """Mutex distribué simple via SET NX EX. À utiliser comme `async with lock(...)`.

    Le bloc protégé ne s'exécute que si on a obtenu le verrou. Sinon, on yield False.
    Le verrou expire automatiquement après `ttl` secondes (protection deadlock).
    """
    if _client is None:
        yield True  # mode single-instance : pas de coordination nécessaire
        return
    acquired = False
    try:
        acquired = bool(await _client.set(key, "1", nx=True, ex=ttl))
        yield acquired
    finally:
        if acquired:
            try:
                await _client.delete(key)
            except Exception as exc:
                logger.warning("Failed to release Redis lock %s: %s", key, exc)


async def publish(channel: str, payload: Any) -> bool:
    """Publie un payload (auto-sérialisé en JSON si dict/list) sur un canal pubsub."""
    if _client is None:
        return False
    if not isinstance(payload, (str, bytes)):
        payload = json.dumps(payload)
    try:
        await _client.publish(channel, payload)
        return True
    except Exception as exc:
        logger.warning("Redis publish failed on %s: %s", channel, exc)
        return False
