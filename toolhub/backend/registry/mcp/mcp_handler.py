"""GenericMCPHandler — proxy vers un serveur MCP externe (HTTP JSON-RPC 2.0)."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from registry.base import BaseToolHandler, ToolAction, ToolExecutionError

logger = logging.getLogger(__name__)


class GenericMCPHandler(BaseToolHandler):
    CATEGORY = "mcp"
    NAME = "mcp"
    LABEL = "MCP Server"
    DESCRIPTION = "Proxy générique vers un serveur MCP externe (HTTP JSON-RPC 2.0)."
    INTEGRATION_TYPE = "mcp"
    CONFIG_SCHEMA = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL du serveur MCP (ex: http://mcp-server:3000)"},
            "auth_type": {
                "type": "string",
                "enum": ["none", "bearer", "basic"],
                "default": "none",
            },
            "auth_token": {"type": "string", "description": "Token Bearer ou base64 Basic"},
        },
        "required": ["url"],
    }
    CACHE_TTL = 30

    def list_actions(self) -> list[ToolAction]:
        return [
            ToolAction(
                name="call",
                description="Appelle un outil du serveur MCP.",
                parameters={
                    "type": "object",
                    "properties": {
                        "tool_name": {"type": "string", "description": "Nom de l'outil MCP"},
                        "arguments": {"type": "object", "description": "Arguments de l'outil"},
                    },
                    "required": ["tool_name"],
                },
            ),
            ToolAction(
                name="list_tools",
                description="Liste les outils disponibles sur le serveur MCP.",
                parameters={"type": "object", "properties": {}, "required": []},
                cache_ttl=300,
            ),
        ]

    def _build_headers(self, credentials: dict) -> dict:
        h = {"Content-Type": "application/json"}
        auth_type = credentials.get("auth_type", "none")
        token = credentials.get("auth_token", "")
        if auth_type == "bearer" and token:
            h["Authorization"] = f"Bearer {token}"
        elif auth_type == "basic" and token:
            h["Authorization"] = f"Basic {token}"
        return h

    async def _jsonrpc(self, url: str, headers: dict, method: str, params: dict) -> Any:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise ToolExecutionError(f"MCP server error {resp.status_code}: {resp.text[:200]}", status_code=resp.status_code)
        data = resp.json()
        if "error" in data:
            raise ToolExecutionError(f"MCP JSON-RPC error: {data['error']}")
        return data.get("result")

    async def execute(self, action: str, params: dict, credentials: dict) -> Any:
        url = credentials.get("url")
        if not url:
            raise ToolExecutionError("MCP credentials missing 'url'")
        headers = self._build_headers(credentials)

        if action == "list_tools":
            result = await self._jsonrpc(url, headers, "tools/list", {})
            tools = result.get("tools", []) if result else []
            return {"tools": tools, "count": len(tools)}

        if action == "call":
            tool_name = params.get("tool_name")
            if not tool_name:
                raise ToolExecutionError("MCP call requires 'tool_name'")
            result = await self._jsonrpc(url, headers, "tools/call", {"name": tool_name, "arguments": params.get("arguments", {})})
            content = result.get("content", []) if result else []
            if isinstance(content, list):
                text = "\n".join(c.get("text", "") for c in content if c.get("type") == "text")
                return {"result": text, "raw": content}
            return {"result": str(result)}

        raise ToolExecutionError(f"Unknown MCP action: {action}")
