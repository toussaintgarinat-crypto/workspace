"""Tests invitations calendrier."""

from httpx import AsyncClient


async def _make_cal(client: AsyncClient) -> str:
    r = await client.post("/calendars", json={"name": "Cal"})
    return r.json()["id"]


async def test_create_invitation(client: AsyncClient):
    cal_id = await _make_cal(client)
    r = await client.post(f"/calendars/{cal_id}/invitations", json={"email": "invite@example.com", "expires_in_hours": 24})
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "invite@example.com"
    assert data["calendar_id"] == cal_id
    assert data["used_at"] is None
    assert "token" in data


async def test_create_invitation_no_expiry(client: AsyncClient):
    cal_id = await _make_cal(client)
    r = await client.post(f"/calendars/{cal_id}/invitations", json={"expires_in_hours": None})
    assert r.status_code == 201
    assert r.json()["expires_at"] is None


async def test_list_invitations(client: AsyncClient):
    cal_id = await _make_cal(client)
    await client.post(f"/calendars/{cal_id}/invitations", json={})
    await client.post(f"/calendars/{cal_id}/invitations", json={})
    r = await client.get(f"/calendars/{cal_id}/invitations")
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_get_invitation_by_token(client: AsyncClient):
    cal_id = await _make_cal(client)
    r = await client.post(f"/calendars/{cal_id}/invitations", json={})
    token = r.json()["token"]
    r2 = await client.get(f"/invitations/{token}")
    assert r2.status_code == 200
    assert r2.json()["token"] == token


async def test_get_invitation_not_found(client: AsyncClient):
    r = await client.get("/invitations/nonexistent-token")
    assert r.status_code == 404


async def test_accept_invitation(client: AsyncClient):
    cal_id = await _make_cal(client)
    r = await client.post(f"/calendars/{cal_id}/invitations", json={})
    token = r.json()["token"]
    r2 = await client.post(f"/invitations/{token}/accept")
    assert r2.status_code == 200
    assert r2.json()["calendar_id"] == cal_id


async def test_accept_invitation_twice(client: AsyncClient):
    cal_id = await _make_cal(client)
    r = await client.post(f"/calendars/{cal_id}/invitations", json={})
    token = r.json()["token"]
    await client.post(f"/invitations/{token}/accept")
    r2 = await client.post(f"/invitations/{token}/accept")
    assert r2.status_code == 409


async def test_invitation_calendar_not_found(client: AsyncClient):
    r = await client.get("/calendars/nonexistent/invitations")
    assert r.status_code == 404
