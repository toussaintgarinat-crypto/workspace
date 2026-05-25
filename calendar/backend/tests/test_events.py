"""Tests CRUD événements."""

from httpx import AsyncClient

EVENT_PAYLOAD = {
    "title": "Réunion",
    "start_at": "2026-06-01T10:00:00",
    "end_at": "2026-06-01T11:00:00",
}


async def _create_calendar(client: AsyncClient, name: str = "Cal") -> str:
    r = await client.post("/calendars", json={"name": name})
    return r.json()["id"]


async def test_list_events_empty(client: AsyncClient):
    cal_id = await _create_calendar(client)
    r = await client.get(f"/calendars/{cal_id}/events")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_event(client: AsyncClient):
    cal_id = await _create_calendar(client)
    r = await client.post(f"/calendars/{cal_id}/events", json=EVENT_PAYLOAD)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Réunion"
    assert data["calendar_id"] == cal_id
    assert data["created_by"] == "anonymous"


async def test_create_event_missing_field(client: AsyncClient):
    cal_id = await _create_calendar(client)
    r = await client.post(f"/calendars/{cal_id}/events", json={"title": "Sans date"})
    assert r.status_code == 422


async def test_list_events(client: AsyncClient):
    cal_id = await _create_calendar(client)
    await client.post(f"/calendars/{cal_id}/events", json=EVENT_PAYLOAD)
    await client.post(f"/calendars/{cal_id}/events", json={
        "title": "Deuxième",
        "start_at": "2026-06-02T14:00:00",
        "end_at": "2026-06-02T15:00:00",
    })
    r = await client.get(f"/calendars/{cal_id}/events")
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_list_events_date_filter(client: AsyncClient):
    cal_id = await _create_calendar(client)
    await client.post(f"/calendars/{cal_id}/events", json={
        "title": "Juin",
        "start_at": "2026-06-01T10:00:00",
        "end_at": "2026-06-01T11:00:00",
    })
    await client.post(f"/calendars/{cal_id}/events", json={
        "title": "Juillet",
        "start_at": "2026-07-01T10:00:00",
        "end_at": "2026-07-01T11:00:00",
    })
    r = await client.get(f"/calendars/{cal_id}/events?end=2026-06-30T23:59:59")
    assert r.status_code == 200
    titles = [e["title"] for e in r.json()]
    assert "Juin" in titles
    assert "Juillet" not in titles


async def test_get_event(client: AsyncClient):
    cal_id = await _create_calendar(client)
    r = await client.post(f"/calendars/{cal_id}/events", json=EVENT_PAYLOAD)
    event_id = r.json()["id"]
    r2 = await client.get(f"/events/{event_id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == event_id


async def test_get_event_not_found(client: AsyncClient):
    r = await client.get("/events/nonexistent")
    assert r.status_code == 404


async def test_update_event(client: AsyncClient):
    cal_id = await _create_calendar(client)
    r = await client.post(f"/calendars/{cal_id}/events", json=EVENT_PAYLOAD)
    event_id = r.json()["id"]
    r2 = await client.patch(f"/events/{event_id}", json={"title": "Modifié", "location": "Paris"})
    assert r2.status_code == 200
    assert r2.json()["title"] == "Modifié"
    assert r2.json()["location"] == "Paris"


async def test_delete_event(client: AsyncClient):
    cal_id = await _create_calendar(client)
    r = await client.post(f"/calendars/{cal_id}/events", json=EVENT_PAYLOAD)
    event_id = r.json()["id"]
    r2 = await client.delete(f"/events/{event_id}")
    assert r2.status_code == 204
    r3 = await client.get(f"/events/{event_id}")
    assert r3.status_code == 404


async def test_delete_event_not_found(client: AsyncClient):
    r = await client.delete("/events/nonexistent")
    assert r.status_code == 404


async def test_event_calendar_not_found(client: AsyncClient):
    r = await client.get("/calendars/nonexistent/events")
    assert r.status_code == 404
