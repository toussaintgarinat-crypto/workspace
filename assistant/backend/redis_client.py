"""Shim local — délègue au module partagé agent_personnel_shared.redis_client.

Garde la compatibilité avec les imports existants :
    from redis_client import init_redis, close_redis, redis_client
"""

from agent_personnel_shared.redis_client import (
    close_redis,
    get_raw_client,
    init_redis as _init_redis_shared,
    lock,
    publish,
)


async def init_redis() -> bool:
    from config import settings
    return await _init_redis_shared(settings.REDIS_URL)


def __getattr__(name: str):
    # `redis_client` est un global dynamique : on le résout à la demande pour pointer
    # sur l'instance courante (ou None) gérée par le module partagé.
    if name == "redis_client":
        return get_raw_client()
    raise AttributeError(name)


__all__ = ["init_redis", "close_redis", "lock", "publish"]
