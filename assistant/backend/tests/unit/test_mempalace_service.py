"""Tests for services.mempalace_service — credential resolution + HTTP proxy."""

import pytest
import respx
from httpx import Response
from fastapi import HTTPException

from services import mempalace_service


@pytest.mark.asyncio
async def test_get_creds_503_when_no_connection(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", False)
    with pytest.raises(HTTPException) as exc:
        await mempalace_service.get_mempalace_creds(fake_user)
    assert exc.value.status_code == 503
    assert "MemPalace not connected" in exc.value.detail


@pytest.mark.asyncio
async def test_get_creds_from_connections_table(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", False)
    from db import upsert_connection
    await upsert_connection(
        id="mp-1", name="MP", url="http://mp.test:8100", token="tok",
        app_type="mempalace", enabled=True,
    )
    url, token = await mempalace_service.get_mempalace_creds(fake_user)
    assert url == "http://mp.test:8100"
    assert token == "tok"


@pytest.mark.asyncio
async def test_get_creds_skips_disabled(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", False)
    from db import upsert_connection
    await upsert_connection(
        id="mp-1", name="MP", url="http://mp.test:8100", token="tok",
        app_type="mempalace", enabled=False,
    )
    with pytest.raises(HTTPException) as exc:
        await mempalace_service.get_mempalace_creds(fake_user)
    assert exc.value.status_code == 503


@pytest.mark.asyncio
@respx.mock
async def test_mp_get_success(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", False)
    from db import upsert_connection
    await upsert_connection(
        id="mp-1", name="MP", url="http://mp.test:8100", token="tok",
        app_type="mempalace", enabled=True,
    )
    route = respx.get("http://mp.test:8100/api/drawers").mock(
        return_value=Response(200, json=[{"id": "d1"}])
    )
    resp = await mempalace_service.mp_get(fake_user, "/api/drawers")
    assert route.called
    assert resp.json() == [{"id": "d1"}]
    assert route.calls[0].request.headers["authorization"] == "Bearer tok"


@pytest.mark.asyncio
@respx.mock
async def test_mp_get_propagates_404(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", False)
    from db import upsert_connection
    await upsert_connection(
        id="mp-1", name="MP", url="http://mp.test:8100", token="tok",
        app_type="mempalace", enabled=True,
    )
    respx.get("http://mp.test:8100/api/missing").mock(
        return_value=Response(404, text="not found")
    )
    with pytest.raises(HTTPException) as exc:
        await mempalace_service.mp_get(fake_user, "/api/missing")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
@respx.mock
async def test_mp_post_sends_json(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", False)
    from db import upsert_connection
    await upsert_connection(
        id="mp-1", name="MP", url="http://mp.test:8100", token="tok",
        app_type="mempalace", enabled=True,
    )
    route = respx.post("http://mp.test:8100/api/drawers").mock(
        return_value=Response(201, json={"id": "new"})
    )
    resp = await mempalace_service.mp_post(
        fake_user, "/api/drawers", {"content": "hello"}
    )
    assert route.called
    assert resp.json() == {"id": "new"}
    sent = route.calls[0].request
    assert b"hello" in sent.content
