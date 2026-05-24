"""Tests for services.connections_service.resolve_active_connections.

Utilise une vraie SQLite via fixture real_db — PAS de mock DB.
"""

import pytest

from services.connections_service import resolve_active_connections


@pytest.mark.asyncio
async def test_resolve_empty_when_no_connections(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", False)
    active = await resolve_active_connections(fake_user)
    assert active == []


@pytest.mark.asyncio
async def test_resolve_keeps_enabled_only(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", False)
    from db import upsert_connection
    await upsert_connection("c1", "Mp", "http://mp", "t1", "mempalace", True)
    await upsert_connection("c2", "Forge", "http://forge", "t2", "forge", False)

    active = await resolve_active_connections(fake_user)
    assert len(active) == 1
    assert active[0]["app_type"] == "mempalace"


@pytest.mark.asyncio
async def test_resolve_vault_mode_returns_token_entries(fake_user, real_db, monkeypatch):
    """AUTH_ENABLED=True : on lit user_tokens via vault et on remplit avec default_url."""
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", True)
    from vault import upsert_vault_token

    await upsert_vault_token(fake_user["sub"], "mempalace", "raw-token-1")
    await upsert_vault_token(fake_user["sub"], "forge", "raw-token-2")

    active = await resolve_active_connections(fake_user)
    app_types = sorted(c["app_type"] for c in active)
    assert app_types == ["forge", "mempalace"]

    mp_entry = next(c for c in active if c["app_type"] == "mempalace")
    assert mp_entry["url"] == "http://localhost:8100"
    assert mp_entry["token"] == "raw-token-1"
    assert mp_entry["enabled"] is True


@pytest.mark.asyncio
async def test_resolve_vault_mode_empty(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", True)
    active = await resolve_active_connections(fake_user)
    assert active == []
