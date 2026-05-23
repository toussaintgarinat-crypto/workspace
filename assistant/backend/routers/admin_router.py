"""Admin dashboard endpoints (status, updater, disk, degraded mode)."""

import asyncio
import json
import logging
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from auth import require_admin
from config import settings
import degraded as degraded_mod
from models.schemas import (
    AlertmanagerWebhookBody,
    DegradedToggleBody,
    UpdateBody,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

_SHARED_DIR = "/shared"
_STORAGE_DIR = "/storage"
_TAG_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
_DEGRADED_SERVICE = "assistant"


# ── Status ───────────────────────────────────────────────────────────────────

@router.get("/status")
async def admin_status(_: dict = Depends(require_admin)):
    from redis_client import redis_client
    from proactive import _replica_id, _LEADER_KEY
    from metrics import sse_clients_active

    redis_info = None
    pubsub_channels: dict = {}
    leader_id: str | None = None

    if redis_client:
        try:
            info = await redis_client.info()
            redis_info = {
                "memory": info.get("used_memory_human"),
                "connected_clients": info.get("connected_clients"),
                "ops_per_sec": info.get("instantaneous_ops_per_sec"),
            }
            leader_id = await redis_client.get(_LEADER_KEY)
            channels = await redis_client.pubsub_channels("*")
            if channels:
                pubsub_channels = await redis_client.pubsub_numsub(*channels)
        except Exception as e:
            logger.warning("Admin Redis stats failed: %s", e)

    sse_stats: dict = {}
    for stream in ["alerts", "swarm"]:
        try:
            sse_stats[stream] = int(
                sse_clients_active.labels(stream=stream)._value.get()
            )
        except Exception:
            sse_stats[stream] = 0

    return {
        "replica_id": _replica_id,
        "is_leader": (leader_id == _replica_id) if leader_id else True,
        "leader_id": leader_id or _replica_id,
        "auth_warning": not settings.AUTH_ENABLED,
        "redis": redis_info,
        "pubsub_channels": pubsub_channels,
        "sse_clients": sse_stats,
    }


# ── Updater sidecar ──────────────────────────────────────────────────────────

@router.post("/update")
async def admin_update(body: UpdateBody, _: dict = Depends(require_admin)):
    if not _TAG_RE.match(body.target_tag):
        raise HTTPException(status_code=400, detail="Format de tag invalide")
    if not os.path.isdir(_SHARED_DIR):
        raise HTTPException(status_code=503, detail="Module updater non installé")

    status_file = os.path.join(_SHARED_DIR, "update-status")
    request_file = os.path.join(_SHARED_DIR, "update-request")

    if os.path.exists(status_file):
        os.remove(status_file)

    with open(request_file, "w") as fh:
        json.dump({"target_tag": body.target_tag}, fh)

    return {"accepted": True, "target_tag": body.target_tag}


@router.get("/update/stream")
async def admin_update_stream(_: dict = Depends(require_admin)):
    if not os.path.isdir(_SHARED_DIR):
        raise HTTPException(status_code=503, detail="Module updater non installé")

    async def generator():
        status_file = os.path.join(_SHARED_DIR, "update-status")
        timeout = 180
        elapsed = 0

        while elapsed < timeout:
            if os.path.exists(status_file):
                try:
                    with open(status_file) as fh:
                        data = json.load(fh)
                    yield json.dumps(data, ensure_ascii=False)
                    if data.get("status") in ("done", "error"):
                        return
                except Exception:
                    pass
            await asyncio.sleep(1)
            elapsed += 1

        yield json.dumps(
            {"status": "error", "message": "Timeout dépassé.", "progress": 0}
        )

    return EventSourceResponse(generator())


# ── Disk collector sidecar ───────────────────────────────────────────────────

@router.get("/disk")
async def admin_disk(_: dict = Depends(require_admin)):
    disk_file = os.path.join(_STORAGE_DIR, "disk-info.json")
    if not os.path.exists(disk_file):
        raise HTTPException(
            status_code=503, detail="Module disk-collector non installé"
        )
    try:
        with open(disk_file) as fh:
            return json.load(fh)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Degraded mode (S90) ──────────────────────────────────────────────────────

@router.get("/degraded")
async def admin_get_degraded(_: dict = Depends(require_admin)):
    states = await degraded_mod.get_degraded_states(_DEGRADED_SERVICE)
    any_degraded = any(v["degraded"] for v in states.values())
    return {
        "service": _DEGRADED_SERVICE,
        "components": states,
        "any_degraded": any_degraded,
    }


@router.post("/degraded")
async def admin_toggle_degraded(
    body: DegradedToggleBody, _: dict = Depends(require_admin)
):
    if body.component not in degraded_mod.COMPONENTS:
        raise HTTPException(
            status_code=400, detail=f"Unknown component: {body.component}"
        )
    await degraded_mod.set_degraded(
        _DEGRADED_SERVICE, body.component, body.degraded, body.ttl
    )
    return {"ok": True, "component": body.component, "degraded": body.degraded}


@router.post("/degraded/auto")
async def admin_degraded_webhook(
    body: AlertmanagerWebhookBody, request: Request
):
    token = request.headers.get("X-Degraded-Token", "")
    if not degraded_mod.verify_webhook_token(token):
        raise HTTPException(status_code=403, detail="Invalid token")

    toggled = []
    for alert in body.alerts:
        alertname = alert.get("labels", {}).get("alertname", "")
        component = degraded_mod.alertname_to_component(alertname)
        if not component:
            continue
        degraded = body.status == "firing"
        await degraded_mod.set_degraded(_DEGRADED_SERVICE, component, degraded)
        logger.warning(
            "Auto degraded %s for %s (alert: %s)",
            "ON" if degraded else "OFF",
            component,
            alertname,
        )
        toggled.append(
            {"component": component, "degraded": degraded, "alert": alertname}
        )

    return {"ok": True, "toggled": toggled}
