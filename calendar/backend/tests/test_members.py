"""Tests membres de calendrier."""

from httpx import AsyncClient


async def _make_cal(client: AsyncClient) -> str:
    r = await client.post("/calendars", json={"name": "Cal"})
    return r.json()["id"]


async def test_list_members_empty(client: AsyncClient):
    cal_id = await _make_cal(client)
    r = await client.get(f"/calendars/{cal_id}/members")
    assert r.status_code == 200
    assert r.json() == []


async def test_add_member(client: AsyncClient):
    cal_id = await _make_cal(client)
    r = await client.post(f"/calendars/{cal_id}/members", json={"user_id": "user-2", "role": "editor"})
    assert r.status_code == 201
    data = r.json()
    assert data["user_id"] == "user-2"
    assert data["role"] == "editor"
    assert data["calendar_id"] == cal_id


async def test_add_member_invalid_role(client: AsyncClient):
    cal_id = await _make_cal(client)
    r = await client.post(f"/calendars/{cal_id}/members", json={"user_id": "u", "role": "superadmin"})
    assert r.status_code == 422


async def test_add_member_duplicate(client: AsyncClient):
    cal_id = await _make_cal(client)
    await client.post(f"/calendars/{cal_id}/members", json={"user_id": "dup"})
    r2 = await client.post(f"/calendars/{cal_id}/members", json={"user_id": "dup"})
    assert r2.status_code == 409


async def test_remove_member(client: AsyncClient):
    cal_id = await _make_cal(client)
    await client.post(f"/calendars/{cal_id}/members", json={"user_id": "to-remove"})
    r = await client.delete(f"/calendars/{cal_id}/members/to-remove")
    assert r.status_code == 204
    r2 = await client.get(f"/calendars/{cal_id}/members")
    assert r2.json() == []


async def test_remove_member_not_found(client: AsyncClient):
    cal_id = await _make_cal(client)
    r = await client.delete(f"/calendars/{cal_id}/members/ghost")
    assert r.status_code == 404


async def test_calendar_not_found_for_members(client: AsyncClient):
    r = await client.get("/calendars/nonexistent/members")
    assert r.status_code == 404
