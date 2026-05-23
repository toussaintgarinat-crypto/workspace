"""Proactive scheduler + AlertsView SSE notifications."""

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from auth import get_current_user
from db import (
    count_unread_alerts,
    get_alerts,
    get_proactive_config,
    mark_alert_read,
    upsert_proactive_config,
)
from models.schemas import ProactiveConfigBody
from notifiers import inapp as inapp_notifier
import proactive as proactive_mod

router = APIRouter(prefix="/proactive", tags=["proactive"])


@router.get("/status")
async def proactive_status():
    status = proactive_mod.get_status()
    cfg = await get_proactive_config()
    status["enabled"] = cfg.get("enabled", False)
    status["unread_count"] = await count_unread_alerts()
    return status


@router.get("/config")
async def proactive_get_config():
    return await get_proactive_config()


@router.put("/config")
async def proactive_put_config(
    body: ProactiveConfigBody, _: dict = Depends(get_current_user)
):
    await upsert_proactive_config(
        enabled=body.enabled,
        interval_minutes=body.interval_minutes,
        reminder_hours=body.reminder_hours,
        events_config=body.events_config,
        channels_config=body.channels_config,
    )
    return {"saved": True}


@router.post("/check")
async def proactive_manual_check(_: dict = Depends(get_current_user)):
    cfg = await get_proactive_config()
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Le mode proactif est désactivé")
    asyncio.create_task(proactive_mod.run_check())
    return {"started": True}


@router.get("/alerts")
async def proactive_list_alerts(unread_only: bool = False, limit: int = 100):
    return await get_alerts(unread_only=unread_only, limit=limit)


@router.post("/alerts/{alert_id}/read")
async def proactive_mark_read(alert_id: str):
    await mark_alert_read(alert_id)
    unread = await count_unread_alerts()
    await inapp_notifier.broadcast({"type": "badge_update", "unread_count": unread})
    return {"ok": True}


@router.get("/alerts/stream")
async def proactive_alerts_stream():
    from metrics import sse_clients_active
    q = inapp_notifier.subscribe()
    sse_clients_active.labels(stream="alerts").inc()

    async def generator():
        unread = await count_unread_alerts()
        yield json.dumps(
            {"type": "init", "unread_count": unread}, ensure_ascii=False
        )
        try:
            while True:
                try:
                    item = await asyncio.wait_for(q.get(), timeout=25)
                    yield json.dumps(item, ensure_ascii=False)
                except asyncio.TimeoutError:
                    yield json.dumps({"type": "ping"}, ensure_ascii=False)
        except asyncio.CancelledError:
            pass
        finally:
            inapp_notifier.unsubscribe(q)
            sse_clients_active.labels(stream="alerts").dec()

    return EventSourceResponse(generator())
