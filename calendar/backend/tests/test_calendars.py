"""Tests CRUD calendriers."""

from httpx import AsyncClient


async def test_list_empty(client: AsyncClient):
    r = await client.get("/calendars")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_calendar(client: AsyncClient):
    r = await client.post("/calendars", json={"name": "Perso", "color": "#FF0000"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Perso"
    assert data["color"] == "#FF0000"
    assert data["user_id"] == "anonymous"
    assert "id" in data


async def test_list_after_create(client: AsyncClient):
    await client.post("/calendars", json={"name": "Cal 1"})
    await client.post("/calendars", json={"name": "Cal 2"})
    r = await client.get("/calendars")
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_get_calendar(client: AsyncClient):
    r = await client.post("/calendars", json={"name": "Test"})
    cal_id = r.json()["id"]
    r2 = await client.get(f"/calendars/{cal_id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == cal_id


async def test_get_calendar_not_found(client: AsyncClient):
    r = await client.get("/calendars/nonexistent")
    assert r.status_code == 404


async def test_update_calendar(client: AsyncClient):
    r = await client.post("/calendars", json={"name": "Original"})
    cal_id = r.json()["id"]
    r2 = await client.patch(f"/calendars/{cal_id}", json={"name": "Modifié", "color": "#00FF00"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "Modifié"
    assert r2.json()["color"] == "#00FF00"


async def test_update_partial(client: AsyncClient):
    r = await client.post("/calendars", json={"name": "Partiel", "color": "#111111"})
    cal_id = r.json()["id"]
    r2 = await client.patch(f"/calendars/{cal_id}", json={"color": "#222222"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "Partiel"
    assert r2.json()["color"] == "#222222"


async def test_delete_calendar(client: AsyncClient):
    r = await client.post("/calendars", json={"name": "À supprimer"})
    cal_id = r.json()["id"]
    r2 = await client.delete(f"/calendars/{cal_id}")
    assert r2.status_code == 204
    r3 = await client.get(f"/calendars/{cal_id}")
    assert r3.status_code == 404


async def test_delete_not_found(client: AsyncClient):
    r = await client.delete("/calendars/nonexistent")
    assert r.status_code == 404


async def test_create_with_defaults(client: AsyncClient):
    r = await client.post("/calendars", json={"name": "Default"})
    assert r.status_code == 201
    data = r.json()
    assert data["color"] == "#3B82F6"
    assert data["is_default"] is False
    assert data["description"] is None
