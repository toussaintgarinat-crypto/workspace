"""Cache Redis pour les résultats d'exécution d'outils."""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)
_NS = "toolhub:cache"


async def get_cached(key: str) -> Any | None:
    try:
        from agent_personnel_shared.redis_client import get_client
        client = get_client(_NS)
        if client is None:
            return None
        raw = await client.get(key)
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.debug("Cache get failed for %s: %s", key, exc)
        return None


async def set_cached(key: str, value: Any, ttl: int) -> None:
    try:
        from agent_personnel_shared.redis_client import get_client
        client = get_client(_NS)
        if client is None or ttl <= 0:
            return
        await client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as exc:
        logger.debug("Cache set failed for %s: %s", key, exc)
