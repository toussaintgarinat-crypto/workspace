"""Tests unitaires pour tools.calendar.CalendarTools."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tools.calendar import CalendarTools, OPENAI_TOOLS, _CALENDAR_DOWN_MSG


# ── Fixtures ────────────────────────────────────────────────────────────────

USER_ID = "user-42"
BASE_URL = "http://calendar:8400"
TOKEN = "svc-token"


def make_tools(user_id: str = USER_ID) -> CalendarTools:
    return CalendarTools(BASE_URL, TOKEN, user_id)


def mock_resp(data) -> MagicMock:
    resp = MagicMock()
    resp.json.return_value = data
    return resp


# ── Méta ────────────────────────────────────────────────────────────────────

def test_get_tools_returns_five():
    ct = make_tools()
    tools = ct.get_tools()
    assert len(tools) == 5
    names = [t["function"]["name"] for t in tools]
    assert names == [
        "calendar_list_calendars",
        "calendar_list_events",
        "calendar_create_event",
        "calendar_update_event",
        "calendar_delete_event",
    ]


def test_openai_tools_schema_valid():
    for tool in OPENAI_TOOLS:
        assert tool["type"] == "function"
        fn = tool["function"]
        assert "name" in fn
        assert "description" in fn
        assert "parameters" in fn


def test_headers_include_user_id():
    ct = make_tools("uid-99")
    assert ct._h() == {"X-User-Id": "uid-99"}


# ── list_calendars ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_calendars():
    ct = make_tools()
    ct._client.get = AsyncMock(return_value=mock_resp([{"id": "cal-1", "name": "Perso"}]))
    result = await ct.list_calendars()
    assert result[0]["id"] == "cal-1"
    ct._client.get.assert_awaited_once_with("/calendars", headers={"X-User-Id": USER_ID})


# ── list_events ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_events_no_filters():
    ct = make_tools()
    ct._client.get = AsyncMock(return_value=mock_resp([]))
    await ct.list_events("cal-1")
    ct._client.get.assert_awaited_once_with(
        "/calendars/cal-1/events", params={}, headers={"X-User-Id": USER_ID}
    )


@pytest.mark.asyncio
async def test_list_events_with_dates():
    ct = make_tools()
    ct._client.get = AsyncMock(return_value=mock_resp([]))
    await ct.list_events("cal-1", "2026-05-01", "2026-05-31")
    ct._client.get.assert_awaited_once_with(
        "/calendars/cal-1/events",
        params={"start": "2026-05-01", "end": "2026-05-31"},
        headers={"X-User-Id": USER_ID},
    )


# ── create_event ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_event_minimal():
    ct = make_tools()
    ct._client.post = AsyncMock(return_value=mock_resp({"id": "ev-1", "title": "Réunion"}))
    result = await ct.create_event(
        "cal-1", "Réunion", "2026-05-26T14:00:00", "2026-05-26T15:00:00"
    )
    assert result["id"] == "ev-1"
    ct._client.post.assert_awaited_once()
    _, kwargs = ct._client.post.call_args
    body = kwargs["json"]
    assert body["title"] == "Réunion"
    assert "description" not in body


@pytest.mark.asyncio
async def test_create_event_full():
    ct = make_tools()
    ct._client.post = AsyncMock(return_value=mock_resp({"id": "ev-2"}))
    await ct.create_event(
        "cal-1", "Stand-up", "2026-05-26T09:00:00", "2026-05-26T09:30:00",
        description="Daily", location="Salle A", all_day=False
    )
    _, kwargs = ct._client.post.call_args
    body = kwargs["json"]
    assert body["description"] == "Daily"
    assert body["location"] == "Salle A"


# ── update_event ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_event():
    ct = make_tools()
    ct._client.patch = AsyncMock(return_value=mock_resp({"id": "ev-1", "title": "Réunion v2"}))
    result = await ct.update_event("ev-1", title="Réunion v2")
    assert result["title"] == "Réunion v2"
    ct._client.patch.assert_awaited_once_with(
        "/events/ev-1", json={"title": "Réunion v2"}, headers={"X-User-Id": USER_ID}
    )


# ── delete_event ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_event():
    ct = make_tools()
    ct._client.delete = AsyncMock(return_value=MagicMock())
    msg = await ct.delete_event("ev-1")
    assert "supprimé" in msg
    ct._client.delete.assert_awaited_once_with(
        "/events/ev-1", headers={"X-User-Id": USER_ID}
    )


# ── execute_tool dispatcher ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_tool_list_calendars():
    ct = make_tools()
    ct.list_calendars = AsyncMock(return_value=[{"id": "c1"}])
    result = await ct.execute_tool("calendar_list_calendars", {})
    assert "c1" in result


@pytest.mark.asyncio
async def test_execute_tool_list_events():
    ct = make_tools()
    ct.list_events = AsyncMock(return_value=[])
    result = await ct.execute_tool("calendar_list_events", {"calendar_id": "cal-1"})
    ct.list_events.assert_awaited_once_with("cal-1", "", "")
    assert isinstance(result, str)


@pytest.mark.asyncio
async def test_execute_tool_create_event():
    ct = make_tools()
    ct.create_event = AsyncMock(return_value={"id": "ev-99"})
    result = await ct.execute_tool("calendar_create_event", {
        "calendar_id": "cal-1",
        "title": "Test",
        "start_at": "2026-05-26T10:00:00",
        "end_at": "2026-05-26T11:00:00",
    })
    assert "ev-99" in result


@pytest.mark.asyncio
async def test_execute_tool_update_event():
    ct = make_tools()
    ct.update_event = AsyncMock(return_value={"id": "ev-1"})
    await ct.execute_tool("calendar_update_event", {"event_id": "ev-1", "title": "New"})
    ct.update_event.assert_awaited_once_with("ev-1", title="New")


@pytest.mark.asyncio
async def test_execute_tool_delete_event():
    ct = make_tools()
    ct.delete_event = AsyncMock(return_value="Événement supprimé.")
    result = await ct.execute_tool("calendar_delete_event", {"event_id": "ev-1"})
    assert "supprimé" in result


@pytest.mark.asyncio
async def test_execute_tool_unknown_raises():
    ct = make_tools()
    with pytest.raises(ValueError, match="Unknown tool"):
        await ct.execute_tool("calendar_unknown", {})


# ── S2S circuit breaker / degraded ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_tool_degrades_on_s2s_error():
    from agent_personnel_shared.http_client import S2SRequestError
    ct = make_tools()
    ct._client.get = AsyncMock(side_effect=S2SRequestError("calendar down"))
    result = await ct.execute_tool("calendar_list_calendars", {})
    assert result == _CALENDAR_DOWN_MSG
