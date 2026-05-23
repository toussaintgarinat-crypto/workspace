"""Thin proxy to the LiteLLM gateway (model management + key management)."""

import httpx
from fastapi import HTTPException

from config import settings


async def gw_request(method: str, path: str, body: dict | None = None) -> dict:
    """Authenticated request against the LiteLLM gateway admin API."""
    if not settings.GATEWAY_MASTER_KEY:
        raise HTTPException(
            status_code=503, detail="GATEWAY_MASTER_KEY not configured"
        )
    headers = {"Authorization": f"Bearer {settings.GATEWAY_MASTER_KEY}"}
    async with httpx.AsyncClient(timeout=10) as client:
        url = f"{settings.GATEWAY_URL}{path}"
        if method == "GET":
            r = await client.get(url, headers=headers)
        else:
            r = await client.post(url, json=body, headers=headers)
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()
