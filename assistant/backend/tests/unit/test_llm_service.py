"""Tests for services.llm_service.gateway_client routing."""

from services.llm_service import gateway_client
from config import settings


def test_gateway_client_default_base_url():
    client = gateway_client()
    # AsyncOpenAI exposes base_url as URL with trailing slash
    assert str(client.base_url).rstrip("/") == settings.GATEWAY_URL.rstrip("/")


def test_gateway_client_versioned_appends_v1():
    client = gateway_client(versioned=True)
    assert str(client.base_url).rstrip("/").endswith("/v1")


def test_gateway_client_uses_api_key():
    client = gateway_client()
    assert client.api_key == settings.GATEWAY_API_KEY
