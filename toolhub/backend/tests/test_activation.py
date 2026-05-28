"""Tests du service d'activation (3 niveaux)."""
from __future__ import annotations

import json
import pytest
import pytest_asyncio

from models.orm import Tool, ToolCategory, UserToolCredential
from services.activation import ActivationError, check_activation


@pytest_asyncio.fixture
async def seeded_db(db):
    """Crée une catégorie + un outil + des credentials en DB."""
    cat = ToolCategory(slug="test_cat", name="Test Cat", enabled=True)
    db.add(cat)
    await db.flush()

    tool = Tool(
        category_id=cat.id,
        name="test_tool",
        label="Test Tool",
        integration_type="api",
        enabled=True,
    )
    db.add(tool)
    await db.flush()

    # Credentials : on stocke du JSON clair (TOOLHUB_ENCRYPTION_KEY pas configuré en test)
    cred = UserToolCredential(
        user_id="user_123",
        tool_id=tool.id,
        credentials_encrypted=json.dumps({"api_key": "test_key"}),
        enabled=True,
    )
    db.add(cred)
    await db.commit()

    return {"category": cat, "tool": tool, "credential": cred}


@pytest.mark.asyncio
async def test_activation_success(seeded_db, db):
    result = await check_activation("test_tool", "user_123", db)
    assert result.tool.name == "test_tool"
    assert result.credentials["api_key"] == "test_key"


@pytest.mark.asyncio
async def test_activation_tool_not_found(db):
    with pytest.raises(ActivationError) as exc_info:
        await check_activation("nonexistent_tool", "user_123", db)
    assert exc_info.value.level == "tool"


@pytest.mark.asyncio
async def test_activation_tool_disabled(seeded_db, db):
    seeded_db["tool"].enabled = False
    await db.commit()
    with pytest.raises(ActivationError) as exc_info:
        await check_activation("test_tool", "user_123", db)
    assert exc_info.value.level == "tool"
    # Restore
    seeded_db["tool"].enabled = True
    await db.commit()


@pytest.mark.asyncio
async def test_activation_category_disabled(seeded_db, db):
    seeded_db["category"].enabled = False
    await db.commit()
    with pytest.raises(ActivationError) as exc_info:
        await check_activation("test_tool", "user_123", db)
    assert exc_info.value.level == "category"
    # Restore
    seeded_db["category"].enabled = True
    await db.commit()


@pytest.mark.asyncio
async def test_activation_credential_disabled(seeded_db, db):
    seeded_db["credential"].enabled = False
    await db.commit()
    with pytest.raises(ActivationError) as exc_info:
        await check_activation("test_tool", "user_123", db)
    assert exc_info.value.level == "credential"
    # Restore
    seeded_db["credential"].enabled = True
    await db.commit()


@pytest.mark.asyncio
async def test_activation_no_credential(seeded_db, db):
    with pytest.raises(ActivationError) as exc_info:
        await check_activation("test_tool", "unknown_user", db)
    assert exc_info.value.level == "credential"
