"""Tests for services.upload_service — push / confirm vers MemPalace.

NOTE S102 : depuis S99 ces helpers utilisent ``S2SClient``. On stub ``_mp_client``
pour vérifier le mapping (success → id, S2SError → None / (False, msg)) sans
dépendre de la chaîne retry + circuit breaker (cf. note dans test_mempalace_service.py).
"""

import pytest
import httpx

from agent_personnel_shared.http_client import S2SRequestError
from services import upload_service


class _StubClient:
    def __init__(self, resp=None, exc=None):
        self._resp = resp
        self._exc = exc
        self.calls: list[tuple[str, dict]] = []

    async def post(self, path, **kw):
        self.calls.append((path, kw))
        if self._exc:
            raise self._exc
        return self._resp


@pytest.mark.asyncio
async def test_push_document_returns_id_on_success(mempalace_conn, monkeypatch):
    stub = _StubClient(resp=httpx.Response(201, json={"id": "doc-42"}))
    monkeypatch.setattr(upload_service, "_mp_client", lambda conn, timeout: stub)
    out = await upload_service.push_document_to_mempalace(
        mempalace_conn, "hello.txt", b"hello", "text/plain", "Memoire", "notes",
    )
    assert out == "doc-42"
    # Vérifie la nouvelle convention de path /v1/api/...
    assert stub.calls[0][0] == "/v1/api/documents"
    assert "files" in stub.calls[0][1]
    assert stub.calls[0][1]["data"] == {"wing": "memoire", "room": "notes"}


@pytest.mark.asyncio
async def test_push_document_passes_default_mime(mempalace_conn, monkeypatch):
    stub = _StubClient(resp=httpx.Response(200, json={"id": "x"}))
    monkeypatch.setattr(upload_service, "_mp_client", lambda conn, timeout: stub)
    await upload_service.push_document_to_mempalace(
        mempalace_conn, "x.bin", b"x", None, "Memoire", "raw",
    )
    files = stub.calls[0][1]["files"]
    # file = (filename, content, mime) — fallback application/octet-stream
    assert files["file"][2] == "application/octet-stream"


@pytest.mark.asyncio
async def test_push_document_returns_none_on_s2s_error(mempalace_conn, monkeypatch):
    stub = _StubClient(exc=S2SRequestError("boom"))
    monkeypatch.setattr(upload_service, "_mp_client", lambda conn, timeout: stub)
    out = await upload_service.push_document_to_mempalace(
        mempalace_conn, "x.txt", b"x", "text/plain", "Memoire", "notes",
    )
    assert out is None


@pytest.mark.asyncio
async def test_confirm_drawer_success(mempalace_conn, monkeypatch):
    stub = _StubClient(resp=httpx.Response(201, json={"id": "d1"}))
    monkeypatch.setattr(upload_service, "_mp_client", lambda conn, timeout: stub)
    ok, err = await upload_service.confirm_drawer_to_mempalace(
        mempalace_conn, "summary content", "Memoire", "My Notes", "x.txt", "doc-1",
    )
    assert ok is True
    assert err is None
    # path et payload
    assert stub.calls[0][0] == "/v1/api/drawers"
    payload = stub.calls[0][1]["json"]
    assert payload["content"] == "summary content"
    assert payload["wing"] == "memoire"
    assert payload["room"] == "my-notes"  # espaces → tirets, lowercase
    assert payload["metadata"] == {"source_file": "x.txt", "file_id": "doc-1"}


@pytest.mark.asyncio
async def test_confirm_drawer_failure_returns_message(mempalace_conn, monkeypatch):
    stub = _StubClient(exc=S2SRequestError("503"))
    monkeypatch.setattr(upload_service, "_mp_client", lambda conn, timeout: stub)
    ok, err = await upload_service.confirm_drawer_to_mempalace(
        mempalace_conn, "summary", "Memoire", "notes", "x.txt", None,
    )
    assert ok is False
    assert err is not None
    assert "503" in err
