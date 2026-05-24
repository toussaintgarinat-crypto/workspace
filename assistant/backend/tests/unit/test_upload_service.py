"""Tests for services.upload_service — push / confirm vers MemPalace via HTTP mock."""

import pytest
import respx
from httpx import Response

from services import upload_service


@pytest.mark.asyncio
@respx.mock
async def test_push_document_returns_id_on_201(mempalace_conn):
    respx.post("http://mempalace.test:8100/api/documents").mock(
        return_value=Response(201, json={"id": "doc-42"})
    )
    out = await upload_service.push_document_to_mempalace(
        mempalace_conn, "hello.txt", b"hello", "text/plain", "Memoire", "notes",
    )
    assert out == "doc-42"


@pytest.mark.asyncio
@respx.mock
async def test_push_document_returns_id_on_200(mempalace_conn):
    respx.post("http://mempalace.test:8100/api/documents").mock(
        return_value=Response(200, json={"id": "doc-7"})
    )
    out = await upload_service.push_document_to_mempalace(
        mempalace_conn, "x.pdf", b"%PDF", "application/pdf", "Memoire", "scans",
    )
    assert out == "doc-7"


@pytest.mark.asyncio
@respx.mock
async def test_push_document_returns_none_on_error(mempalace_conn):
    respx.post("http://mempalace.test:8100/api/documents").mock(
        return_value=Response(500, text="boom")
    )
    out = await upload_service.push_document_to_mempalace(
        mempalace_conn, "x.txt", b"x", "text/plain", "Memoire", "notes",
    )
    assert out is None


@pytest.mark.asyncio
@respx.mock
async def test_push_document_swallows_network_error(mempalace_conn):
    respx.post("http://mempalace.test:8100/api/documents").mock(
        side_effect=Exception("network gone")
    )
    out = await upload_service.push_document_to_mempalace(
        mempalace_conn, "x.txt", b"x", None, "Memoire", "notes",
    )
    assert out is None


@pytest.mark.asyncio
@respx.mock
async def test_confirm_drawer_success(mempalace_conn):
    respx.post("http://mempalace.test:8100/api/drawers").mock(
        return_value=Response(201, json={"id": "drw-1"})
    )
    ok, err = await upload_service.confirm_drawer_to_mempalace(
        mempalace_conn, "summary content", "Memoire", "notes", "x.txt", "doc-1",
    )
    assert ok is True
    assert err is None


@pytest.mark.asyncio
@respx.mock
async def test_confirm_drawer_failure_returns_error(mempalace_conn):
    respx.post("http://mempalace.test:8100/api/drawers").mock(
        return_value=Response(500, text="db down")
    )
    ok, err = await upload_service.confirm_drawer_to_mempalace(
        mempalace_conn, "summary", "Memoire", "notes", "x.txt", None,
    )
    assert ok is False
    assert err is not None
