"""POST /v1/execute/{tool_name} — point d'entrée principal pour S2S."""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models.orm import ToolExecution
from models.schemas import ExecuteRequest, ExecuteResponse
from registry.loader import get_handler
from services.activation import ActivationError, check_activation
from services.cache import get_cached, set_cached

router = APIRouter(prefix="/execute", tags=["execute"])
logger = logging.getLogger(__name__)

_SAFE_FIELDS_BLACKLIST = {"password", "token", "secret", "api_key", "access_token", "auth_token"}


@router.post("/{tool_name}", response_model=ExecuteResponse)
async def execute_tool(
    body: ExecuteRequest,
    tool_name: str = Path(..., description="Nom du tool (ex: gmail, github)"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["sub"]
    start_ms = int(time.monotonic() * 1000)

    # Vérification des 3 niveaux d'activation
    try:
        activation = await check_activation(tool_name, user_id, db)
    except ActivationError as exc:
        await _log_execution(db, None, user_id, body.action, body.params, "disabled", str(exc))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "tool_disabled", "reason": str(exc), "level": exc.level},
        )

    tool = activation.tool

    # Cache Redis (lecture)
    action_cache_ttl = _get_action_cache_ttl(tool_name, body.action, tool.cache_ttl)
    cache_key = f"{tool_name}:{user_id}:{body.action}:{sorted(body.params.items())}"
    if action_cache_ttl > 0:
        cached = await get_cached(cache_key)
        if cached is not None:
            duration_ms = int(time.monotonic() * 1000) - start_ms
            await _log_execution(db, tool.id, user_id, body.action, body.params, "cached", None, duration_ms, from_cache=True)
            return ExecuteResponse(result=cached, from_cache=True, duration_ms=duration_ms)

    # Exécution via le handler
    handler = get_handler(tool_name)
    if not handler:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Handler not found: {tool_name}")

    try:
        result = await handler.execute(body.action, body.params, activation.credentials)
    except Exception as exc:
        duration_ms = int(time.monotonic() * 1000) - start_ms
        await _log_execution(db, tool.id, user_id, body.action, body.params, "error", str(exc), duration_ms)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "tool_execution_failed", "detail": str(exc)},
        )

    # Cache Redis (écriture)
    if action_cache_ttl > 0:
        await set_cached(cache_key, result, ttl=action_cache_ttl)

    duration_ms = int(time.monotonic() * 1000) - start_ms
    await _log_execution(db, tool.id, user_id, body.action, body.params, "success", None, duration_ms)
    return ExecuteResponse(result=result, from_cache=False, duration_ms=duration_ms)


def _get_action_cache_ttl(tool_name: str, action: str, tool_default_ttl: int) -> int:
    handler = get_handler(tool_name)
    if handler:
        for ta in handler.list_actions():
            if ta.name == action:
                return ta.cache_ttl
    return tool_default_ttl


async def _log_execution(
    db: AsyncSession,
    tool_id: str | None,
    user_id: str,
    action: str,
    params: dict,
    exec_status: str,
    error_detail: str | None,
    duration_ms: int = 0,
    from_cache: bool = False,
) -> None:
    try:
        safe_params = {k: v for k, v in params.items() if k not in _SAFE_FIELDS_BLACKLIST}
        log_entry = ToolExecution(
            tool_id=tool_id,
            user_id=user_id,
            action=action,
            request_payload=safe_params,
            status=exec_status,
            error_detail=error_detail,
            duration_ms=duration_ms,
            from_cache=from_cache,
        )
        db.add(log_entry)
        await db.commit()
    except Exception as exc:
        logger.warning("Failed to log execution: %s", exc)
