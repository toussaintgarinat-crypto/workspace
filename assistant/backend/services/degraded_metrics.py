"""Background task that mirrors Redis degraded flags into Prometheus gauges."""

import asyncio
import logging

import degraded as degraded_mod

logger = logging.getLogger(__name__)


async def sync_degraded_metrics() -> None:
    from metrics import degraded_component_active
    while True:
        try:
            states = await degraded_mod.get_degraded_states("assistant")
            for comp, info in states.items():
                degraded_component_active.labels(
                    service="assistant", component=comp
                ).set(1 if info.get("degraded") else 0)
        except Exception as exc:
            logger.warning("Degraded metric sync failed: %s", exc)
        await asyncio.sleep(30)
