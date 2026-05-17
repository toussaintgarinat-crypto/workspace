import logging
from typing import Optional

logger = logging.getLogger(__name__)

redis_client: Optional["aioredis.Redis"] = None


async def init_redis() -> bool:
    global redis_client
    import os
    redis_url = os.getenv("REDIS_URL", "")
    if not redis_url:
        logger.info("REDIS_URL not set — single-instance mode (no Redis)")
        return False
    try:
        import redis.asyncio as aioredis
        redis_client = aioredis.from_url(redis_url, decode_responses=True)
        await redis_client.ping()
        logger.info("Redis connected: %s", redis_url)
        return True
    except Exception as e:
        logger.warning("Redis unavailable (%s) — falling back to single-instance mode", e)
        redis_client = None
        return False


async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.aclose()
        redis_client = None
