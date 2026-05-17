import logging
from typing import Optional

logger = logging.getLogger(__name__)

redis_client: Optional["aioredis.Redis"] = None


async def init_redis() -> bool:
    global redis_client
    from config import settings
    if not settings.REDIS_URL:
        logger.info("REDIS_URL not set — single-instance mode (no Redis)")
        return False
    try:
        import redis.asyncio as aioredis
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await redis_client.ping()
        logger.info("Redis connected: %s", settings.REDIS_URL)
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
