"""Tests de l'endpoint POST /execute/{tool_name}."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_execute_tool_not_found(client):
    resp = await client.post("/v1/execute/unknown_tool", json={"action": "test", "params": {}})
    # Soit 403 (activation error) soit 404, pas 500
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_execute_disabled_tool_returns_403(client, db):
    from models.orm import Tool, ToolCategory
    cat = ToolCategory(slug="exec_test_cat", name="Exec Test Cat", enabled=False)
    db.add(cat)
    await db.flush()
    tool = Tool(category_id=cat.id, name="exec_test_tool", label="Exec Test", integration_type="api", enabled=True)
    db.add(tool)
    await db.commit()

    resp = await client.post("/v1/execute/exec_test_tool", json={"action": "test", "params": {}})
    assert resp.status_code == 403
    data = resp.json()
    assert data["detail"]["level"] in ("category", "tool", "credential")
