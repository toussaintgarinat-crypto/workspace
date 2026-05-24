"""Sanity check : pytest tourne, settings se chargent, services importables."""

from services import url_defaults


def test_url_defaults_known():
    assert url_defaults.default_url("mempalace") == "http://localhost:8100"


def test_url_defaults_fallback():
    assert url_defaults.default_url("unknown-app") == "http://localhost:8000"
