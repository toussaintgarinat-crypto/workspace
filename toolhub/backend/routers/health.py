"""GET /health — ToolHub healthcheck."""
from __future__ import annotations

import time

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from db import get_db
from registry.loader import list_handlers

router = APIRouter(tags=["health"])

_start_time = time.time()


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    checks: dict = {}

    # DB
    try:
        await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as exc:
        checks["db"] = f"error: {exc}"

    # Redis
    try:
        from agent_personnel_shared.redis_client import get_client
        rc = get_client("toolhub")
        if rc:
            await rc.ping()
            checks["redis"] = "ok"
        else:
            checks["redis"] = "disabled"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    # Registry
    handlers = list_handlers()
    checks["registry"] = f"{len(handlers)} handlers"

    uptime = int(time.time() - _start_time)
    status = "ok" if checks.get("db") == "ok" else "degraded"
    return {"status": status, "uptime_s": uptime, "checks": checks}
