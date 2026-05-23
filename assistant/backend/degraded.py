import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_DEGRADED_TOKEN = os.environ.get("DEGRADED_WEBHOOK_TOKEN", "")

COMPONENTS = ["rag", "tools", "summarize", "voice", "kiwix"]


async def get_degraded_states(service: str) -> dict:
    from redis_client import redis_client
    from config import settings

    states: dict[str, dict] = {}

    env_defaults = {
        "rag": settings.RAG_ENABLED,
        "tools": True,
        "summarize": settings.SUMMARIZE_ENABLED,
        "voice": settings.LOCAL_VOICE_ENABLED,
        "kiwix": bool(settings.KIWIX_URL),
    }

    for comp in COMPONENTS:
        key = f"degraded:{service}:{comp}"
        enabled_default = env_defaults.get(comp, True)
        if redis_client:
            try:
                val = await redis_client.get(key)
                if val is not None:
                    degraded = val == "1"
                else:
                    degraded = not enabled_default
            except Exception as exc:
                logger.warning("Redis get degraded state failed: %s", exc)
                degraded = not enabled_default
        else:
            degraded = not enabled_default
        states[comp] = {"degraded": degraded}

    return states


async def set_degraded(service: str, component: str, degraded: bool, ttl: Optional[int] = None) -> None:
    from redis_client import redis_client

    if not redis_client:
        logger.warning("Redis unavailable — degraded toggle ignored for %s:%s", service, component)
        return

    key = f"degraded:{service}:{component}"
    val = "1" if degraded else "0"
    try:
        if ttl:
            await redis_client.setex(key, ttl, val)
        else:
            await redis_client.set(key, val)
        logger.warning("Degraded mode %s for %s:%s", "ON" if degraded else "OFF", service, component)
    except Exception as exc:
        logger.warning("Redis set degraded state failed: %s", exc)


async def is_degraded(service: str, component: str) -> bool:
    states = await get_degraded_states(service)
    return states.get(component, {}).get("degraded", False)


def verify_webhook_token(token: str) -> bool:
    if not _DEGRADED_TOKEN:
        return True
    return token == _DEGRADED_TOKEN


_ALERTMANAGER_COMPONENT_MAP = {
    "QdrantDown": "rag",
    "MinioDown": "tools",
    "RAGLatencyHigh": "rag",
    "ServiceDown": None,
}


def alertname_to_component(alertname: str) -> Optional[str]:
    return _ALERTMANAGER_COMPONENT_MAP.get(alertname)
