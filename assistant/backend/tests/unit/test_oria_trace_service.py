"""Tests for services.oria_trace_service.post_oria_trace."""

import pytest

from services import oria_trace_service


class _FakeOria:
    def __init__(self, rooms):
        self._rooms = rooms
        self.posted: list[tuple[str, str]] = []

    async def list_rooms(self):
        return self._rooms

    async def post_message(self, room_id, message):
        self.posted.append((room_id, message))
        return {"ok": True}


@pytest.mark.asyncio
async def test_no_oria_connection_skips(monkeypatch):
    # active vide => return immédiat, pas d'appel réseau
    await oria_trace_service.post_oria_trace(
        active=[], raw_prompt="hi", refined_data=None,
        tools_used=[], result_content="bye",
    )


@pytest.mark.asyncio
async def test_room_missing_skips(monkeypatch, oria_conn):
    fake = _FakeOria(rooms=[{"id": "r1", "name": "general"}])
    monkeypatch.setattr(oria_trace_service, "OriaTools", lambda url, tok: fake)

    await oria_trace_service.post_oria_trace(
        active=[oria_conn], raw_prompt="hi", refined_data=None,
        tools_used=[], result_content="bye",
    )
    assert fake.posted == []


@pytest.mark.asyncio
async def test_posts_to_assistant_traces_room(monkeypatch, oria_conn):
    fake = _FakeOria(rooms=[
        {"id": "r1", "name": "general"},
        {"id": "trace-room", "name": "assistant-traces"},
    ])
    monkeypatch.setattr(oria_trace_service, "OriaTools", lambda url, tok: fake)

    await oria_trace_service.post_oria_trace(
        active=[oria_conn],
        raw_prompt="hello world",
        refined_data={
            "refined_prompt": "hello",
            "interpreted_intent": "greet",
            "confidence": 0.9,
            "uncertainty_flags": ["lang"],
        },
        tools_used=["mempalace_search"],
        result_content="hi user",
    )
    assert len(fake.posted) == 1
    room_id, msg = fake.posted[0]
    assert room_id == "trace-room"
    assert "hello world" in msg
    assert "greet" in msg
    assert "mempalace_search" in msg
    assert "hi user" in msg


@pytest.mark.asyncio
async def test_swallows_errors_silently(monkeypatch, oria_conn):
    class _Boom:
        async def list_rooms(self):
            raise RuntimeError("network down")

    monkeypatch.setattr(oria_trace_service, "OriaTools", lambda url, tok: _Boom())

    # ne doit PAS lever — sinon ça casserait la requête utilisateur
    await oria_trace_service.post_oria_trace(
        active=[oria_conn], raw_prompt="hi", refined_data=None,
        tools_used=[], result_content="bye",
    )


@pytest.mark.asyncio
async def test_skips_when_oria_disabled(monkeypatch):
    disabled = {"app_type": "oria", "url": "http://x", "token": "t", "enabled": False}
    # même si OriaTools est patché, on ne doit jamais l'instancier
    sentinel = {"called": False}

    def _factory(_u, _t):
        sentinel["called"] = True
        return _FakeOria([])
    monkeypatch.setattr(oria_trace_service, "OriaTools", _factory)

    await oria_trace_service.post_oria_trace(
        active=[disabled], raw_prompt="hi", refined_data=None,
        tools_used=[], result_content="bye",
    )
    assert sentinel["called"] is False
