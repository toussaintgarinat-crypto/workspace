"""Tests de l'endpoint MCP (JSON-RPC 2.0)."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_mcp_tools_list(client):
    resp = await client.post("/v1/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("jsonrpc") == "2.0"
    assert "result" in data
    assert "tools" in data["result"]


@pytest.mark.asyncio
async def test_mcp_unknown_method(client):
    resp = await client.post("/v1/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "unknown/method", "params": {}})
    assert resp.status_code == 200
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == -32601


@pytest.mark.asyncio
async def test_mcp_invalid_tool_name_format(client):
    resp = await client.post("/v1/mcp", json={
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "invalidname", "arguments": {}}
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == -32602
