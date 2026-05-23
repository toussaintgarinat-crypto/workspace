"""MemPalace proxy helpers (HTTP client + credential resolution)."""

import httpx
from fastapi import HTTPException

from config import settings
from db import get_connections
from vault import get_vault_token

from services.url_defaults import default_url


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


async def mp_get(user: dict, path: str, params: dict | None = None, timeout: float = 10):
    url, token = await get_mempalace_creds(user)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(
            f"{url}{path}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r


async def mp_post(user: dict, path: str, payload: dict, timeout: float = 15):
    url, token = await get_mempalace_creds(user)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            f"{url}{path}",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r
