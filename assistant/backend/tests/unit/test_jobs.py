"""Tests du module de jobs durables Redis Streams (S125).

On n'a pas de Redis réel en CI : on injecte un faux client en mémoire qui
implémente le minimum utilisé par ``JobWorker`` (hash retries, ACK, streams DLQ).
Les boucles réseau (XREADGROUP/XAUTOCLAIM) ne sont pas testées ici ; on exerce
directement ``_handle`` qui porte toute la logique de retry / DLQ / ack — plus
le mode dégradé (sans Redis) de ``enqueue``.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from agent_personnel_shared import jobs as jobs_mod
from agent_personnel_shared.jobs import JobWorker


class FakeRedis:
    """Faux client Redis minimal, suffisant pour _handle / DLQ / stats."""

    def __init__(self):
        self.hashes: dict[str, dict] = {}
        self.streams: dict[str, list] = {}
        self.acked: list[str] = []

    async def hincrby(self, key, field, amount=1):
        h = self.hashes.setdefault(key, {})
        h[field] = h.get(field, 0) + amount
        return h[field]

    async def hdel(self, key, *fields):
        h = self.hashes.get(key, {})
        for f in fields:
            h.pop(f, None)

    async def xack(self, key, group, *ids):
        self.acked.extend(ids)
        return len(ids)

    async def xadd(self, key, mapping, **kwargs):
        s = self.streams.setdefault(key, [])
        mid = f"{len(s) + 1}-0"
        s.append((mid, mapping))
        return mid

    async def xlen(self, key):
        return len(self.streams.get(key, []))

    async def xpending(self, key, group):
        return {"pending": 0}


def _make_worker(handler, fake, monkeypatch, **kw):
    monkeypatch.setattr(jobs_mod, "get_raw_client", lambda: fake)
    return JobWorker("assistant", "swarm", "workers", handler, **kw)


def _fields(payload: dict) -> dict:
    return {"data": json.dumps(payload)}


async def test_success_acks_and_clears_retries(monkeypatch):
    fake = FakeRedis()
    seen = []

    async def handler(payload):
        seen.append(payload)

    w = _make_worker(handler, fake, monkeypatch, max_retries=3)
    await w._handle(fake, "1-0", _fields({"task_id": "t1"}), "c0")

    assert seen == [{"task_id": "t1"}]
    assert "1-0" in fake.acked
    assert fake.hashes.get(w.retries_key, {}).get("1-0") is None
    assert fake.streams.get(w.dlq_key) is None  # rien en DLQ


async def test_failure_leaves_pending_no_dlq(monkeypatch):
    fake = FakeRedis()

    async def handler(payload):
        raise RuntimeError("boom")

    w = _make_worker(handler, fake, monkeypatch, max_retries=3)
    await w._handle(fake, "1-0", _fields({"task_id": "t1"}), "c0")

    # Première tentative échouée : pas d'ack, pas de DLQ, compteur = 1.
    assert "1-0" not in fake.acked
    assert fake.streams.get(w.dlq_key) is None
    assert fake.hashes[w.retries_key]["1-0"] == 1


async def test_dlq_after_max_retries(monkeypatch):
    fake = FakeRedis()
    dlq_calls = []

    async def handler(payload):
        raise RuntimeError("always fails")

    async def on_dlq(payload, error):
        dlq_calls.append((payload, error))

    w = _make_worker(handler, fake, monkeypatch, max_retries=3, on_dlq=on_dlq)

    # 3 tentatives qui échouent (restent pending), la 4e livraison part en DLQ.
    for _ in range(4):
        await w._handle(fake, "1-0", _fields({"task_id": "t1"}), "c0")

    assert len(fake.streams.get(w.dlq_key, [])) == 1
    assert "1-0" in fake.acked  # acquitté du stream principal
    assert fake.hashes.get(w.retries_key, {}).get("1-0") is None  # compteur nettoyé
    assert len(dlq_calls) == 1
    assert dlq_calls[0][0] == {"task_id": "t1"}


async def test_enqueue_degraded_runs_locally(monkeypatch):
    """Sans Redis (get_raw_client → None), enqueue exécute le handler en local."""
    done = asyncio.Event()
    seen = []

    async def handler(payload):
        seen.append(payload)
        done.set()

    monkeypatch.setattr(jobs_mod, "get_raw_client", lambda: None)
    w = JobWorker("assistant", "swarm", "workers", handler)

    msg_id = await w.enqueue({"task_id": "local-1"})
    assert msg_id is None  # pas de stream
    await asyncio.wait_for(done.wait(), timeout=2)
    assert seen == [{"task_id": "local-1"}]


async def test_global_semaphore_acquire_release(monkeypatch):
    """Le sémaphore global borne la concurrence via le ZSET (eval/zrem)."""
    fake = FakeRedis()
    eval_calls = []
    zrem_calls = []

    async def fake_eval(script, numkeys, *args):
        eval_calls.append(args)
        return 1  # slot accordé

    async def fake_zrem(key, member):
        zrem_calls.append(member)

    fake.eval = fake_eval
    fake.zrem = fake_zrem

    async def handler(payload):
        pass

    w = _make_worker(handler, fake, monkeypatch, max_retries=3, global_concurrency=2)
    await w._handle(fake, "1-0", _fields({"task_id": "t1"}), "c0")

    assert len(eval_calls) == 1   # un acquire
    assert zrem_calls == ["c0:1-0"]  # release du bon membre


async def test_stats_shape(monkeypatch):
    fake = FakeRedis()
    await fake.xadd("assistant:jobs:swarm", {"data": "{}"})
    w = _make_worker(lambda p: None, fake, monkeypatch)
    stats = await w.stats()
    assert stats == {"redis": True, "depth": 1, "pending": 0, "dlq": 0}
