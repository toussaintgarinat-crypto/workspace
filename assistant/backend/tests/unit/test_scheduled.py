"""Tests S123 — claim atomique de `next_run` + élection de leader.

Vraie SQLite via fixture real_db, PAS de mock DB (cf. feedback_approche).
Le bug visé : un prompt dû sélectionné deux fois (tick qui re-tombe sur la
même ligne tant que `run_now` n'a pas fini son stream).
"""

from datetime import datetime, timezone, timedelta

import pytest

import scheduled as scheduled_mod
from db import database


async def _ensure_table_empty():
    await scheduled_mod.init_scheduled_table()
    await database.execute("DELETE FROM scheduled_prompts")


async def _insert(prompt_id: str, schedule: str, next_run: str, active: int = 1):
    now = datetime.now(timezone.utc).isoformat()
    await database.execute(
        """
        INSERT INTO scheduled_prompts (id, title, prompt, schedule, active, next_run, created_at)
        VALUES (:id, :title, :prompt, :schedule, :active, :next_run, :now)
        """,
        {"id": prompt_id, "title": "t", "prompt": "p", "schedule": schedule,
         "active": active, "next_run": next_run, "now": now},
    )


@pytest.mark.asyncio
async def test_claim_returns_due_prompts(real_db):
    await _ensure_table_empty()
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    await _insert("p1", "hourly", past)

    now = datetime.now(timezone.utc).isoformat()
    claimed = await scheduled_mod._claim_due(now)

    assert claimed == ["p1"]


@pytest.mark.asyncio
async def test_claim_advances_next_run_and_prevents_double_selection(real_db):
    """Le cœur du bug S123 : après claim, le même tick (même `now`) ne doit
    plus retomber sur la ligne."""
    await _ensure_table_empty()
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    await _insert("p1", "hourly", past)

    now = datetime.now(timezone.utc).isoformat()
    first = await scheduled_mod._claim_due(now)
    assert first == ["p1"]

    # next_run a été repoussé dans le futur
    row = await scheduled_mod.get_scheduled("p1")
    assert row["next_run"] > now

    # Un second claim avec le même `now` ne re-sélectionne rien
    second = await scheduled_mod._claim_due(now)
    assert second == []


@pytest.mark.asyncio
async def test_claim_ignores_inactive_and_future(real_db):
    await _ensure_table_empty()
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    await _insert("inactive", "hourly", past, active=0)
    await _insert("future", "hourly", future)
    await _insert("due", "hourly", past)

    now = datetime.now(timezone.utc).isoformat()
    claimed = await scheduled_mod._claim_due(now)

    assert claimed == ["due"]


@pytest.mark.asyncio
async def test_run_now_does_not_touch_next_run(real_db, monkeypatch):
    """run_now ne met plus à jour next_run (sinon fenêtre de double exécution
    après un stream long). Il ne touche que last_run."""
    await _ensure_table_empty()
    pinned_next = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    await _insert("p1", "hourly", pinned_next)

    # Neutralise l'appel LLM : on ne teste ici que l'effet DB.
    async def _fake_stream_chat(self, messages, on_chunk):
        await on_chunk({"type": "text", "content": "ok"})

    monkeypatch.setattr("agent.ReActAgent.stream_chat", _fake_stream_chat)
    monkeypatch.setattr(scheduled_mod, "get_connections", _fake_no_conns)
    monkeypatch.setattr(
        scheduled_mod.inapp_notifier, "broadcast", _fake_broadcast
    )

    res = await scheduled_mod.run_now("p1")
    assert res["ok"] is True

    row = await scheduled_mod.get_scheduled("p1")
    assert row["next_run"] == pinned_next  # inchangé
    assert row["last_run"] is not None     # avancé


@pytest.mark.asyncio
async def test_is_leader_true_without_redis():
    """Mono-instance (pas de Redis) : toujours leader."""
    from leader import is_leader
    import redis_client
    assert redis_client.redis_client is None
    assert await is_leader() is True


# ── helpers monkeypatch ──────────────────────────────────────────────────────

async def _fake_no_conns():
    return []


async def _fake_broadcast(_msg):
    return None
