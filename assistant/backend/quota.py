import logging
from datetime import date, datetime, timezone
from fastapi import HTTPException, status

from config import settings

logger = logging.getLogger(__name__)


def _is_premium(user: dict) -> bool:
    roles = user.get("realm_access", {}).get("roles", [])
    return settings.QUOTA_PREMIUM_ROLE in roles


def _seconds_until_midnight() -> int:
    now = datetime.now(timezone.utc)
    midnight = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    midnight = midnight.replace(day=midnight.day + 1)
    return int((midnight - now).total_seconds())


async def check_quota(user: dict) -> None:
    """Raise 429 if the user has exceeded their daily chat quota."""
    if not settings.AUTH_ENABLED:
        return

    from redis_client import redis_client
    if not redis_client:
        return

    user_id = user.get("sub", "anonymous")
    limit = settings.QUOTA_PREMIUM_DAILY if _is_premium(user) else settings.QUOTA_FREE_DAILY
    today = date.today().isoformat()
    key = f"quota:{user_id}:{today}"

    try:
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, _seconds_until_midnight())
        if count > limit:
            tier = "premium" if _is_premium(user) else "free"
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "quota_exceeded",
                    "tier": tier,
                    "limit": limit,
                    "used": count,
                    "resets_at": f"{today}T23:59:59Z",
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Quota check failed (Redis error) — allowing request: %s", e)
