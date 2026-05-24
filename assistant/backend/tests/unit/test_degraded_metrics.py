"""Test for services.degraded_metrics.sync_degraded_metrics.

On exécute une seule itération en cassant la boucle via une exception planifiée
sur le 2e appel à get_degraded_states. Mocks ciblés sur les fonctions externes
(degraded.get_degraded_states + metrics.degraded_component_active) — pas de DB.
"""

import asyncio
import pytest

from services import degraded_metrics as svc


class _GaugeStub:
    def __init__(self):
        self.values = {}

    def labels(self, **kw):
        key = tuple(sorted(kw.items()))
        gauge = self
        class _Bound:
            def set(self, v):
                gauge.values[key] = v
        return _Bound()


@pytest.mark.asyncio
async def test_sync_writes_gauges_then_stops(monkeypatch):
    gauge = _GaugeStub()

    # patch metrics module attr lazily-imported par le service
    import metrics
    monkeypatch.setattr(metrics, "degraded_component_active", gauge)

    call_count = {"n": 0}

    async def fake_states(service):
        call_count["n"] += 1
        if call_count["n"] >= 2:
            raise asyncio.CancelledError()
        return {
            "llm":   {"degraded": True},
            "redis": {"degraded": False},
        }

    import degraded as degraded_mod
    monkeypatch.setattr(degraded_mod, "get_degraded_states", fake_states)

    # asyncio.sleep est court-circuité pour ne pas attendre 30s
    async def no_sleep(_):
        return None
    monkeypatch.setattr(svc.asyncio, "sleep", no_sleep)

    with pytest.raises(asyncio.CancelledError):
        await svc.sync_degraded_metrics()

    assert gauge.values[(("component", "llm"), ("service", "assistant"))] == 1
    assert gauge.values[(("component", "redis"), ("service", "assistant"))] == 0


@pytest.mark.asyncio
async def test_sync_logs_and_continues_on_error(monkeypatch):
    """Une exception côté get_degraded_states ne doit pas crasher la coroutine."""
    gauge = _GaugeStub()
    import metrics
    monkeypatch.setattr(metrics, "degraded_component_active", gauge)

    call_count = {"n": 0}

    async def fake_states(service):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("redis down")
        # 2e appel : on stoppe
        raise asyncio.CancelledError()

    import degraded as degraded_mod
    monkeypatch.setattr(degraded_mod, "get_degraded_states", fake_states)

    async def no_sleep(_):
        return None
    monkeypatch.setattr(svc.asyncio, "sleep", no_sleep)

    with pytest.raises(asyncio.CancelledError):
        await svc.sync_degraded_metrics()

    assert call_count["n"] == 2  # la 1re exception n'a pas tué la boucle
