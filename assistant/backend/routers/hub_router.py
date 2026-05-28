"""Hub router — S120/S121/S122 : agrégation statut services + proxy Forge/ToolHub."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from config import settings
from agent_personnel_shared.http_client import S2SClient, S2SError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hub", tags=["hub"])

_TIMEOUT = 4.0


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _ping(url: str) -> dict:
    """Return {status, latency_ms} — never raises."""
    if not url:
        return {"status": "disabled"}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            import time
            t0 = time.monotonic()
            r = await c.get(f"{url.rstrip('/')}/health")
            ms = round((time.monotonic() - t0) * 1000)
            if r.status_code < 500:
                return {"status": "ok", "latency_ms": ms}
            return {"status": "degraded", "latency_ms": ms}
    except Exception:
        return {"status": "down"}


def _forge_client() -> S2SClient | None:
    if not settings.FORGE_URL:
        return None
    return S2SClient(
        base_url=settings.FORGE_URL,
        token=settings.FORGE_SERVICE_TOKEN,
        service_name="forge",
        timeout=10.0,
    )


def _toolhub_client() -> S2SClient | None:
    if not settings.TOOLHUB_URL:
        return None
    return S2SClient(
        base_url=settings.TOOLHUB_URL,
        token=settings.TOOLHUB_SERVICE_TOKEN,
        service_name="toolhub",
        timeout=10.0,
    )


# ── GET /hub/services ─────────────────────────────────────────────────────────

@router.get("/services")
async def hub_services(user: dict = Depends(get_current_user)) -> list[dict]:
    """Retourne le statut agrégé de tous les services de la plateforme."""
    results = await asyncio.gather(
        _ping(settings.FORGE_URL),
        _ping(settings.TOOLHUB_URL),
        _ping(settings.CALENDAR_URL),
        _ping(_mempalace_url()),
        return_exceptions=False,
    )
    forge_status, toolhub_status, calendar_status, mp_status = results

    services = [
        {
            "id": "forge",
            "label": "Forge",
            "emoji": "⚒️",
            "url": settings.FORGE_URL or "",
            "frontend_url": settings.FORGE_FRONTEND_URL or "",
            **forge_status,
        },
        {
            "id": "oria",
            "label": "Oria",
            "emoji": "🌐",
            "url": "",
            "frontend_url": settings.ORIA_FRONTEND_URL or "",
            "status": "external",
        },
        {
            "id": "mempalace",
            "label": "MemPalace",
            "emoji": "🧠",
            "url": _mempalace_url(),
            "frontend_url": "",
            **mp_status,
        },
        {
            "id": "toolhub",
            "label": "ToolHub",
            "emoji": "🔧",
            "url": settings.TOOLHUB_URL or "",
            "frontend_url": "",
            **toolhub_status,
        },
        {
            "id": "calendar",
            "label": "Calendar",
            "emoji": "📅",
            "url": settings.CALENDAR_URL or "",
            "frontend_url": "",
            **calendar_status,
        },
    ]
    return services


def _mempalace_url() -> str:
    return settings.MEMPALACE_HEALTH_URL or ""


# ── GET /hub/forge/agents ──────────────────────────────────────────────────────

@router.get("/forge/agents")
async def forge_list_agents(user: dict = Depends(get_current_user)) -> Any:
    client = _forge_client()
    if not client:
        raise HTTPException(status_code=503, detail="Forge non configuré (FORGE_URL manquant)")
    try:
        r = await client.get("/api/agents")
        return r.json()
    except S2SError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# ── POST /hub/forge/run ────────────────────────────────────────────────────────

class ForgeRunBody(BaseModel):
    task: str
    pole_id: str | None = None


@router.post("/forge/run")
async def forge_run_agent(body: ForgeRunBody, user: dict = Depends(get_current_user)) -> Any:
    client = _forge_client()
    if not client:
        raise HTTPException(status_code=503, detail="Forge non configuré (FORGE_URL manquant)")
    try:
        r = await client.post("/api/agents/run", json={"task": body.task, "poleId": body.pole_id})
        return r.json()
    except S2SError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# ── GET /hub/toolhub/tools ─────────────────────────────────────────────────────

@router.get("/toolhub/tools")
async def toolhub_list_tools(user: dict = Depends(get_current_user)) -> Any:
    client = _toolhub_client()
    if not client:
        raise HTTPException(status_code=503, detail="ToolHub non configuré (TOOLHUB_URL manquant)")
    try:
        r = await client.get("/v1/tools", headers={"X-User-Id": user.get("sub", "")})
        return r.json()
    except S2SError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# ── POST /hub/toolhub/execute/{tool_name} ──────────────────────────────────────

class ToolhubExecBody(BaseModel):
    action: str
    params: dict = {}


@router.post("/toolhub/execute/{tool_name}")
async def toolhub_execute(
    tool_name: str,
    body: ToolhubExecBody,
    user: dict = Depends(get_current_user),
) -> Any:
    client = _toolhub_client()
    if not client:
        raise HTTPException(status_code=503, detail="ToolHub non configuré (TOOLHUB_URL manquant)")
    try:
        r = await client.post(
            f"/v1/execute/{tool_name}",
            json={"action": body.action, "params": body.params},
            headers={"X-User-Id": user.get("sub", "")},
        )
        return r.json()
    except S2SError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
