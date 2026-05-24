"""Tests for services.mempalace_service — credential resolution + S2S error wrapping.

NOTE S102 : depuis S99 le service utilise ``S2SClient`` (retry + circuit breaker).
Les tests ciblent :
 - get_mempalace_creds : pure (DB réelle + vault, PAS de mock DB)
 - mp_get / mp_post : on patch ``_mp_client`` pour vérifier le mapping des
   exceptions S2SCircuitOpenError → HTTP 503 et S2SRequestError → status code
   propagé. Pas de respx ici parce que la chaîne S2SClient déclenche un bug
   downstream `circuitbreaker` (out of scope S102, signalé dans le reporting).
"""

import pytest
import httpx
from fastapi import HTTPException

from agent_personnel_shared.http_client import (
    S2SCircuitOpenError,
    S2SRequestError,
)
from services import mempalace_service


# ── get_mempalace_creds ────────────────────────────────────────────────

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
async def test_get_creds_vault_mode_503_without_token(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", True)
    with pytest.raises(HTTPException) as exc:
        await mempalace_service.get_mempalace_creds(fake_user)
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_get_creds_vault_mode_returns_default_url(fake_user, real_db, monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", True)
    from vault import upsert_vault_token
    await upsert_vault_token(fake_user["sub"], "mempalace", "vault-tok")
    url, token = await mempalace_service.get_mempalace_creds(fake_user)
    assert url == "http://localhost:8100"
    assert token == "vault-tok"


# ── mp_get / mp_post : error wrapping ───────────────────────────────────

class _StubClient:
    def __init__(self, exc=None, resp=None):
        self._exc = exc
        self._resp = resp
        self.calls: list[tuple[str, str, dict]] = []

    async def get(self, path, **kw):
        self.calls.append(("GET", path, kw))
        if self._exc:
            raise self._exc
        return self._resp

    async def post(self, path, **kw):
        self.calls.append(("POST", path, kw))
        if self._exc:
            raise self._exc
        return self._resp


def _stub_creds(monkeypatch):
    """Bypass DB pour ne tester que le wrapping d'erreur de mp_get/mp_post."""
    async def fake_creds(_user):
        return "http://mp.test:8100", "tok"
    monkeypatch.setattr(mempalace_service, "get_mempalace_creds", fake_creds)


def _make_circuit_open_error():
    """S2SCircuitOpenError = circuitbreaker.CircuitBreakerError(circuit, ...).

    Premier arg = un objet CircuitBreaker (sinon __str__ explose en cas de log).
    On utilise une instance réelle pour rester proche du comportement runtime.
    """
    import circuitbreaker
    bkr = circuitbreaker.CircuitBreaker(name="s2s:test", failure_threshold=5, recovery_timeout=30)
    return S2SCircuitOpenError(bkr)


@pytest.mark.asyncio
async def test_mp_get_circuit_open_returns_503(fake_user, monkeypatch):
    _stub_creds(monkeypatch)
    stub = _StubClient(exc=_make_circuit_open_error())
    monkeypatch.setattr(mempalace_service, "_mp_client", lambda u, t, to: stub)
    with pytest.raises(HTTPException) as exc:
        await mempalace_service.mp_get(fake_user, "/v1/drawers")
    assert exc.value.status_code == 503
    assert "temporarily unavailable" in exc.value.detail


@pytest.mark.asyncio
async def test_mp_get_request_error_propagates_status(fake_user, monkeypatch):
    _stub_creds(monkeypatch)
    err = S2SRequestError("404 not found", status_code=404)
    stub = _StubClient(exc=err)
    monkeypatch.setattr(mempalace_service, "_mp_client", lambda u, t, to: stub)
    with pytest.raises(HTTPException) as exc:
        await mempalace_service.mp_get(fake_user, "/v1/missing")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_mp_get_request_error_without_status_falls_back_to_502(fake_user, monkeypatch):
    _stub_creds(monkeypatch)
    err = S2SRequestError("network gone")  # no status_code
    stub = _StubClient(exc=err)
    monkeypatch.setattr(mempalace_service, "_mp_client", lambda u, t, to: stub)
    with pytest.raises(HTTPException) as exc:
        await mempalace_service.mp_get(fake_user, "/v1/missing")
    assert exc.value.status_code == 502


@pytest.mark.asyncio
async def test_mp_post_circuit_open_returns_503(fake_user, monkeypatch):
    _stub_creds(monkeypatch)
    stub = _StubClient(exc=_make_circuit_open_error())
    monkeypatch.setattr(mempalace_service, "_mp_client", lambda u, t, to: stub)
    with pytest.raises(HTTPException) as exc:
        await mempalace_service.mp_post(fake_user, "/v1/drawers", {"x": 1})
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_mp_get_success_returns_underlying_response(fake_user, monkeypatch):
    _stub_creds(monkeypatch)
    fake_resp = httpx.Response(200, json={"ok": True})
    stub = _StubClient(resp=fake_resp)
    monkeypatch.setattr(mempalace_service, "_mp_client", lambda u, t, to: stub)
    out = await mempalace_service.mp_get(fake_user, "/v1/drawers", params={"q": "x"})
    assert out is fake_resp
    assert stub.calls == [("GET", "/v1/drawers", {"params": {"q": "x"}})]


@pytest.mark.asyncio
async def test_mp_post_success_passes_json_payload(fake_user, monkeypatch):
    _stub_creds(monkeypatch)
    fake_resp = httpx.Response(201, json={"id": "new"})
    stub = _StubClient(resp=fake_resp)
    monkeypatch.setattr(mempalace_service, "_mp_client", lambda u, t, to: stub)
    out = await mempalace_service.mp_post(fake_user, "/v1/drawers", {"content": "hi"})
    assert out is fake_resp
    assert stub.calls == [("POST", "/v1/drawers", {"json": {"content": "hi"}})]
