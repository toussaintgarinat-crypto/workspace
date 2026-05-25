"""Tests accès multi-utilisateur — S106d."""

from httpx import AsyncClient


async def _make_cal_as(client: AsyncClient, user_id: str) -> str:
    r = await client.post("/calendars", json={"name": "Cal"}, headers={"X-User-Id": user_id})
    assert r.status_code == 201
    return r.json()["id"]


async def test_calendar_response_includes_role(client: AsyncClient):
    r = await client.post("/calendars", json={"name": "Test"})
    assert r.status_code == 201
    assert r.json()["role"] == "owner"


async def test_list_calendars_includes_role(client: AsyncClient):
    await client.post("/calendars", json={"name": "Mine"})
    r = await client.get("/calendars")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["role"] == "owner"


async def test_non_member_cannot_access_calendar(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    # bob has no access
    r = await client.get(f"/calendars/{cal_id}", headers={"X-User-Id": "bob"})
    assert r.status_code == 404


async def test_shared_calendar_visible_to_member(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    # alice adds bob as viewer
    await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "bob", "role": "viewer"},
        headers={"X-User-Id": "alice"},
    )
    # bob sees the calendar
    r = await client.get(f"/calendars/{cal_id}", headers={"X-User-Id": "bob"})
    assert r.status_code == 200
    assert r.json()["role"] == "viewer"


async def test_shared_calendar_appears_in_list(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "bob", "role": "editor"},
        headers={"X-User-Id": "alice"},
    )
    r = await client.get("/calendars", headers={"X-User-Id": "bob"})
    assert r.status_code == 200
    cals = r.json()
    assert any(c["id"] == cal_id and c["role"] == "editor" for c in cals)


async def test_viewer_can_read_events(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    # alice creates an event
    await client.post(
        f"/calendars/{cal_id}/events",
        json={"title": "Meet", "start_at": "2026-06-01T10:00:00", "end_at": "2026-06-01T11:00:00"},
        headers={"X-User-Id": "alice"},
    )
    # bob added as viewer
    await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "bob", "role": "viewer"},
        headers={"X-User-Id": "alice"},
    )
    # bob can list events
    r = await client.get(f"/calendars/{cal_id}/events", headers={"X-User-Id": "bob"})
    assert r.status_code == 200
    assert len(r.json()) == 1


async def test_viewer_cannot_create_event(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "bob", "role": "viewer"},
        headers={"X-User-Id": "alice"},
    )
    r = await client.post(
        f"/calendars/{cal_id}/events",
        json={"title": "Blocked", "start_at": "2026-06-01T10:00:00", "end_at": "2026-06-01T11:00:00"},
        headers={"X-User-Id": "bob"},
    )
    assert r.status_code == 404  # no editor access


async def test_editor_can_create_event(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "bob", "role": "editor"},
        headers={"X-User-Id": "alice"},
    )
    r = await client.post(
        f"/calendars/{cal_id}/events",
        json={"title": "Team sync", "start_at": "2026-06-01T10:00:00", "end_at": "2026-06-01T11:00:00"},
        headers={"X-User-Id": "bob"},
    )
    assert r.status_code == 201
    assert r.json()["title"] == "Team sync"


async def test_editor_can_delete_event(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    r_evt = await client.post(
        f"/calendars/{cal_id}/events",
        json={"title": "To delete", "start_at": "2026-06-01T10:00:00", "end_at": "2026-06-01T11:00:00"},
        headers={"X-User-Id": "alice"},
    )
    evt_id = r_evt.json()["id"]
    await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "bob", "role": "editor"},
        headers={"X-User-Id": "alice"},
    )
    r = await client.delete(f"/events/{evt_id}", headers={"X-User-Id": "bob"})
    assert r.status_code == 204


async def test_non_member_cannot_create_event(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    r = await client.post(
        f"/calendars/{cal_id}/events",
        json={"title": "Intruder", "start_at": "2026-06-01T10:00:00", "end_at": "2026-06-01T11:00:00"},
        headers={"X-User-Id": "eve"},
    )
    assert r.status_code == 404


async def test_member_cannot_add_other_members(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "bob", "role": "editor"},
        headers={"X-User-Id": "alice"},
    )
    # bob tries to add charlie — should fail (needs owner)
    r = await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "charlie", "role": "viewer"},
        headers={"X-User-Id": "bob"},
    )
    assert r.status_code == 404


async def test_member_cannot_delete_calendar(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "bob", "role": "editor"},
        headers={"X-User-Id": "alice"},
    )
    r = await client.delete(f"/calendars/{cal_id}", headers={"X-User-Id": "bob"})
    assert r.status_code == 404


async def test_viewer_can_list_members(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    await client.post(
        f"/calendars/{cal_id}/members",
        json={"user_id": "bob", "role": "viewer"},
        headers={"X-User-Id": "alice"},
    )
    r = await client.get(f"/calendars/{cal_id}/members", headers={"X-User-Id": "bob"})
    assert r.status_code == 200
    assert len(r.json()) == 1


async def test_invitation_role_propagates(client: AsyncClient):
    cal_id = await _make_cal_as(client, "alice")
    inv_r = await client.post(
        f"/calendars/{cal_id}/invitations",
        json={"role": "editor"},
        headers={"X-User-Id": "alice"},
    )
    assert inv_r.status_code == 201
    assert inv_r.json()["role"] == "editor"
    token = inv_r.json()["token"]
    # bob accepts
    await client.post(f"/invitations/{token}/accept", headers={"X-User-Id": "bob"})
    # bob should now have editor access
    members_r = await client.get(f"/calendars/{cal_id}/members", headers={"X-User-Id": "alice"})
    members = members_r.json()
    bob = next((m for m in members if m["user_id"] == "bob"), None)
    assert bob is not None
    assert bob["role"] == "editor"
