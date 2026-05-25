"""Tests commentaires événement."""

from httpx import AsyncClient

EVENT_PAYLOAD = {
    "title": "Réunion",
    "start_at": "2026-06-01T10:00:00",
    "end_at": "2026-06-01T11:00:00",
}


async def _setup(client: AsyncClient) -> tuple[str, str]:
    r = await client.post("/calendars", json={"name": "Cal"})
    cal_id = r.json()["id"]
    r2 = await client.post(f"/calendars/{cal_id}/events", json=EVENT_PAYLOAD)
    event_id = r2.json()["id"]
    return cal_id, event_id


async def test_list_comments_empty(client: AsyncClient):
    _, event_id = await _setup(client)
    r = await client.get(f"/events/{event_id}/comments")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_comment(client: AsyncClient):
    _, event_id = await _setup(client)
    r = await client.post(f"/events/{event_id}/comments", json={"content": "Super event!"})
    assert r.status_code == 201
    data = r.json()
    assert data["content"] == "Super event!"
    assert data["event_id"] == event_id
    assert data["user_id"] == "anonymous"


async def test_list_comments(client: AsyncClient):
    _, event_id = await _setup(client)
    await client.post(f"/events/{event_id}/comments", json={"content": "Un"})
    await client.post(f"/events/{event_id}/comments", json={"content": "Deux"})
    r = await client.get(f"/events/{event_id}/comments")
    assert len(r.json()) == 2


async def test_update_comment(client: AsyncClient):
    _, event_id = await _setup(client)
    r = await client.post(f"/events/{event_id}/comments", json={"content": "Original"})
    comment_id = r.json()["id"]
    r2 = await client.patch(f"/comments/{comment_id}", json={"content": "Modifié"})
    assert r2.status_code == 200
    assert r2.json()["content"] == "Modifié"


async def test_update_comment_not_found(client: AsyncClient):
    r = await client.patch("/comments/nonexistent", json={"content": "x"})
    assert r.status_code == 404


async def test_delete_comment(client: AsyncClient):
    _, event_id = await _setup(client)
    r = await client.post(f"/events/{event_id}/comments", json={"content": "À supprimer"})
    comment_id = r.json()["id"]
    r2 = await client.delete(f"/comments/{comment_id}")
    assert r2.status_code == 204
    r3 = await client.get(f"/events/{event_id}/comments")
    assert r3.json() == []


async def test_delete_comment_not_found(client: AsyncClient):
    r = await client.delete("/comments/nonexistent")
    assert r.status_code == 404


async def test_comment_event_not_found(client: AsyncClient):
    r = await client.get("/events/nonexistent/comments")
    assert r.status_code == 404
