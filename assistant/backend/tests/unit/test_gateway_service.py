"""Tests for services.gateway_service.gw_request (LiteLLM admin proxy)."""

import pytest
import respx
from httpx import Response
from fastapi import HTTPException

from services.gateway_service import gw_request
from config import settings


@pytest.mark.asyncio
@respx.mock
async def test_gw_request_get_success():
    route = respx.get(f"{settings.GATEWAY_URL}/key/info").mock(
        return_value=Response(200, json={"keys": [{"id": "k1"}]})
    )
    out = await gw_request("GET", "/key/info")
    assert route.called
    assert out == {"keys": [{"id": "k1"}]}
    # vérifie le bearer
    sent = route.calls[0].request
    assert sent.headers["authorization"] == f"Bearer {settings.GATEWAY_MASTER_KEY}"


@pytest.mark.asyncio
@respx.mock
async def test_gw_request_post_with_body():
    route = respx.post(f"{settings.GATEWAY_URL}/key/generate").mock(
        return_value=Response(200, json={"key": "sk-new"})
    )
    out = await gw_request("POST", "/key/generate", body={"max_budget": 10})
    assert route.called
    assert out == {"key": "sk-new"}


@pytest.mark.asyncio
@respx.mock
async def test_gw_request_propagates_http_error():
    respx.get(f"{settings.GATEWAY_URL}/nope").mock(
        return_value=Response(404, text="not found")
    )
    with pytest.raises(HTTPException) as exc:
        await gw_request("GET", "/nope")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_gw_request_503_without_master_key(monkeypatch):
    monkeypatch.setattr(settings, "GATEWAY_MASTER_KEY", "")
    with pytest.raises(HTTPException) as exc:
        await gw_request("GET", "/key/info")
    assert exc.value.status_code == 503
