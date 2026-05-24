"""Pure-function tests for services.url_defaults."""

from services.url_defaults import default_url


def test_forge_default():
    assert default_url("forge") == "http://localhost:8000"


def test_oria_default():
    assert default_url("oria") == "http://localhost:8000"


def test_mempalace_default():
    assert default_url("mempalace") == "http://localhost:8100"


def test_unknown_falls_back_to_8000():
    assert default_url("does-not-exist") == "http://localhost:8000"


def test_empty_string_falls_back():
    assert default_url("") == "http://localhost:8000"
