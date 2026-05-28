"""POST /v1/mcp — expose ToolHub comme serveur MCP (JSON-RPC 2.0).

- method: tools/list  → retourne tous les outils activés en format MCP
- method: tools/call  → exécute un outil via le registry ToolHub
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models.orm import Tool, ToolCategory
from registry.loader import get_handler
from services.activation import ActivationError, check_activation

router = APIRouter(prefix="/mcp", tags=["mcp"])
logger = logging.getLogger(__name__)


@router.post("")
async def mcp_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    body = await request.json()
    rpc_id = body.get("id", 1)
    method = body.get("method", "")
    params = body.get("params", {})
    user_id = user["sub"]

    def ok(result):
        return {"jsonrpc": "2.0", "id": rpc_id, "result": result}

    def err(code: int, message: str):
        return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": code, "message": message}}

    if method == "tools/list":
        tools_q = await db.execute(
            select(Tool)
            .join(ToolCategory, Tool.category_id == ToolCategory.id)
            .where(Tool.enabled.is_(True), ToolCategory.enabled.is_(True))
        )
        active_tools = tools_q.scalars().all()
        mcp_tools = []
        for tool in active_tools:
            handler = get_handler(tool.name)
            if handler:
                mcp_tools.extend(handler.to_mcp_tools())
        return ok({"tools": mcp_tools})

    if method == "tools/call":
        tool_action_name: str = params.get("name", "")
        arguments: dict = params.get("arguments", {})

        # Convention : "gmail_send_email" → tool_name="gmail", action="send_email"
        parts = tool_action_name.split("_", 1)
        if len(parts) != 2:
            return err(-32602, f"Invalid tool name format: {tool_action_name}")
        tool_name, action = parts

        try:
            activation = await check_activation(tool_name, user_id, db)
        except ActivationError as exc:
            return err(-32603, str(exc))

        handler = get_handler(tool_name)
        if not handler:
            return err(-32601, f"Handler not found for tool: {tool_name}")

        try:
            result = await handler.execute(action, arguments, activation.credentials)
            return ok({"content": [{"type": "text", "text": str(result)}]})
        except Exception as exc:
            logger.error("MCP tools/call error: %s", exc)
            return err(-32603, str(exc))

    return err(-32601, f"Method not found: {method}")
