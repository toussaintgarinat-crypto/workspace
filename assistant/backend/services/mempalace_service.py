"""MemPalace proxy helpers (S2S client + credential resolution).

S99 : remplace httpx.AsyncClient direct par S2SClient (retry + circuit breaker).
Les endpoints sont prefixes `/v1/...` (alias legacy actif cote backend MP).
"""

import logging

import httpx
from fastapi import HTTPException

from agent_personnel_shared.http_client import (
    S2SCircuitOpenError,
    S2SClient,
    S2SRequestError,
)

from config import settings
from db import get_connections
from vault import get_vault_token

from services.url_defaults import default_url

logger = logging.getLogger(__name__)


async def get_mempalace_creds(user: dict) -> tuple[str, str]:
    """Return (url, token) for MemPalace or raise HTTP 503."""
    if settings.AUTH_ENABLED:
        token = await get_vault_token(user["sub"], "mempalace")
        if not token:
            raise HTTPException(status_code=503, detail="MemPalace not connected")
        return default_url("mempalace"), token

    connections = await get_connections()
    for c in connections:
        if c.get("app_type") == "mempalace" and c.get("enabled"):
            return c["url"], c["token"]
    raise HTTPException(status_code=503, detail="MemPalace not connected")


def _mp_client(url: str, token: str, timeout: float) -> S2SClient:
    return S2SClient(
        base_url=url,
        token=token,
        service_name="mempalace",
        timeout=timeout,
    )


async def mp_get(user: dict, path: str, params: dict | None = None, timeout: float = 10):
    """GET vers MemPalace. Raise HTTPException si circuit ouvert ou erreur finale.

    Le path doit etre prefixe par `/v1/` pour la nouvelle convention. Les paths
    legacy `/api/...` continuent de fonctionner cote backend MP (alias actif).
    """
    url, token = await get_mempalace_creds(user)
    try:
        return await _mp_client(url, token, timeout).get(path, params=params)
    except S2SCircuitOpenError as exc:
        logger.warning("MemPalace circuit open: %s", exc)
        raise HTTPException(status_code=503, detail="MemPalace temporarily unavailable") from exc
    except S2SRequestError as exc:
        status = exc.status_code or 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


async def mp_post(user: dict, path: str, payload: dict, timeout: float = 15):
    """POST vers MemPalace. Idem `mp_get` cote degradation."""
    url, token = await get_mempalace_creds(user)
    try:
        return await _mp_client(url, token, timeout).post(path, json=payload)
    except S2SCircuitOpenError as exc:
        logger.warning("MemPalace circuit open: %s", exc)
        raise HTTPException(status_code=503, detail="MemPalace temporarily unavailable") from exc
    except S2SRequestError as exc:
        status = exc.status_code or 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


__all__ = ["get_mempalace_creds", "mp_get", "mp_post"]
