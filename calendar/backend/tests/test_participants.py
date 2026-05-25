"""Tests participants d'un événement."""

from httpx import AsyncClient

EVENT_PAYLOAD = {
    "title": "Event",
    "start_at": "2026-06-01T10:00:00",
    "end_at": "2026-06-01T11:00:00",
}


async def _setup(client: AsyncClient) -> str:
    r = await client.post("/calendars", json={"name": "Cal"})
    cal_id = r.json()["id"]
    r2 = await client.post(f"/calendars/{cal_id}/events", json=EVENT_PAYLOAD)
    return r2.json()["id"]


async def test_list_participants_empty(client: AsyncClient):
    event_id = await _setup(client)
    r = await client.get(f"/events/{event_id}/participants")
    assert r.status_code == 200
    assert r.json() == []


async def test_add_participant(client: AsyncClient):
    event_id = await _setup(client)
    r = await client.post(f"/events/{event_id}/participants", json={"user_id": "user-2"})
    assert r.status_code == 201
    data = r.json()
    assert data["user_id"] == "user-2"
    assert data["status"] == "pending"


async def test_add_participant_duplicate(client: AsyncClient):
    event_id = await _setup(client)
    await client.post(f"/events/{event_id}/participants", json={"user_id": "dup"})
    r2 = await client.post(f"/events/{event_id}/participants", json={"user_id": "dup"})
    assert r2.status_code == 409


async def test_update_participant_status(client: AsyncClient):
    event_id = await _setup(client)
    await client.post(f"/events/{event_id}/participants", json={"user_id": "user-x"})
    r = await client.patch(f"/events/{event_id}/participants/user-x", json={"status": "accepted"})
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"
    assert r.json()["responded_at"] is not None


async def test_update_participant_invalid_status(client: AsyncClient):
    event_id = await _setup(client)
    await client.post(f"/events/{event_id}/participants", json={"user_id": "user-y"})
    r = await client.patch(f"/events/{event_id}/participants/user-y", json={"status": "pending"})
    assert r.status_code == 422


async def test_remove_participant(client: AsyncClient):
    event_id = await _setup(client)
    await client.post(f"/events/{event_id}/participants", json={"user_id": "to-del"})
    r = await client.delete(f"/events/{event_id}/participants/to-del")
    assert r.status_code == 204
    r2 = await client.get(f"/events/{event_id}/participants")
    assert r2.json() == []


async def test_remove_participant_not_found(client: AsyncClient):
    event_id = await _setup(client)
    r = await client.delete(f"/events/{event_id}/participants/ghost")
    assert r.status_code == 404


async def test_participants_event_not_found(client: AsyncClient):
    r = await client.get("/events/nonexistent/participants")
    assert r.status_code == 404
