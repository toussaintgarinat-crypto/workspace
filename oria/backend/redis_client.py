"""Shim local — délègue au module partagé agent_personnel_shared.redis_client."""

import os

from agent_personnel_shared.redis_client import (
    close_redis,
    get_raw_client,
    init_redis as _init_redis_shared,
    lock,
    publish,
)


async def init_redis() -> bool:
    return await _init_redis_shared(os.getenv("REDIS_URL", ""))


def __getattr__(name: str):
    if name == "redis_client":
        return get_raw_client()
    raise AttributeError(name)


__all__ = ["init_redis", "close_redis", "lock", "publish"]
