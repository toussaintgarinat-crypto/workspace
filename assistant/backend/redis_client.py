"""Shim local — délègue au module partagé agent_personnel_shared.redis_client.

Le client retourne par `redis_client` est automatiquement prefixe `assistant:`
afin d'eviter les collisions entre services qui partagent la meme instance
Redis (S101). Les cles deja prefixees ("assistant:scheduler:leader" par ex.)
sont detectees et ne sont pas double-prefixees.

Garde la compatibilite avec les imports existants :
    from redis_client import init_redis, close_redis, redis_client, lock, publish
"""

from contextlib import asynccontextmanager

from agent_personnel_shared.redis_client import (
    close_redis,
    get_client as _get_client_shared,
    init_redis as _init_redis_shared,
    lock as _lock_shared,
    publish as _publish_shared,
)

NAMESPACE = "assistant"


def _prefix(key: str) -> str:
    return key if key.startswith(f"{NAMESPACE}:") else f"{NAMESPACE}:{key}"


async def init_redis() -> bool:
    from config import settings
    return await _init_redis_shared(settings.REDIS_URL)


@asynccontextmanager
async def lock(key: str, ttl: int = 30):
    """Wrapper qui prefixe la cle de verrou avec le namespace service."""
    async with _lock_shared(_prefix(key), ttl) as acquired:
        yield acquired


async def publish(channel: str, payload) -> bool:
    """Wrapper qui prefixe le channel avec le namespace service."""
    return await _publish_shared(_prefix(channel), payload)


def __getattr__(name: str):
    # `redis_client` est un global dynamique : on le resout a la demande pour pointer
    # sur l'instance courante prefixee `assistant:` (ou None) geree par le module partage.
    if name == "redis_client":
        return _get_client_shared(NAMESPACE)
    raise AttributeError(name)


__all__ = ["init_redis", "close_redis", "lock", "publish", "NAMESPACE"]
