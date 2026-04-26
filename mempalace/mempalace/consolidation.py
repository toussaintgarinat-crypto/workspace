#!/usr/bin/env python3
"""
consolidation.py — Memory maintenance pipeline for MemPalace.

Inspired by ACT-R / sleep consolidation research:
  1. Promote: episodic → semantic (after 3 accesses)
             semantic  → core     (after 10 accesses)
  2. Forget:  soft-delete drawers with activation < -4.0 AND low importance

Designed to run periodically (cron / CLI command). Zero LLM calls.
"""

import time

from .config import MempalaceConfig
from .decay import compute_activation, get_decay_status
from .storage import get_palace_storage

PROMOTE_TO_SEMANTIC = 3
PROMOTE_TO_CORE = 10
FORGET_ACTIVATION = -4.0
FORGET_MAX_IMPORTANCE = 0.3

BATCH = 100


def _get_col(palace_path: str):
    return get_palace_storage(palace_path, create=False)


def _batch_update(col, ids: list, metas: list) -> None:
    for i in range(0, len(ids), BATCH):
        col.update(ids=ids[i : i + BATCH], metadatas=metas[i : i + BATCH])


def promote_drawers(palace_path: str | None = None) -> dict:
    """
    Promote drawers based on access count:
      episodic → semantic  (access_count >= 3)
      semantic → core      (access_count >= 10)
    """
    cfg = MempalaceConfig()
    col = _get_col(palace_path or cfg.palace_path)

    results = col.get(limit=10_000, include=["metadatas"])
    all_ids = results["ids"]
    all_metas = results["metadatas"]

    promoted_semantic = 0
    promoted_core = 0
    update_ids: list[str] = []
    update_metas: list[dict] = []

    for drawer_id, meta in zip(all_ids, all_metas):
        if meta.get("deleted"):
            continue

        memory_type = meta.get("memory_type", "episodic")
        access_count = int(meta.get("access_count", 0))

        if memory_type == "episodic" and access_count >= PROMOTE_TO_SEMANTIC:
            update_ids.append(drawer_id)
            update_metas.append({"memory_type": "semantic"})
            promoted_semantic += 1

        elif memory_type == "semantic" and access_count >= PROMOTE_TO_CORE:
            update_ids.append(drawer_id)
            update_metas.append({"memory_type": "core"})
            promoted_core += 1

    if update_ids:
        _batch_update(col, update_ids, update_metas)

    return {
        "promoted_to_semantic": promoted_semantic,
        "promoted_to_core": promoted_core,
    }


def forget_stale_drawers(palace_path: str | None = None) -> dict:
    """
    Soft-delete drawers where:
      - activation < FORGET_ACTIVATION (-4.0)
      - importance < FORGET_MAX_IMPORTANCE (0.3)
      - memory_type != "core"
    """
    cfg = MempalaceConfig()
    col = _get_col(palace_path or cfg.palace_path)

    results = col.get(limit=10_000, include=["metadatas"])
    all_ids = results["ids"]
    all_metas = results["metadatas"]

    now_ms = time.time() * 1000
    forgotten = 0
    update_ids: list[str] = []
    update_metas: list[dict] = []

    for drawer_id, meta in zip(all_ids, all_metas):
        if meta.get("deleted"):
            continue

        memory_type = meta.get("memory_type", "episodic")
        if memory_type == "core":
            continue

        importance = float(meta.get("importance", 0.5))
        if importance >= FORGET_MAX_IMPORTANCE:
            continue

        activation = compute_activation(
            access_times_str=meta.get("access_times", ""),
            memory_type=memory_type,
            created_at_str=meta.get("filed_at", ""),
            now_ms=now_ms,
        )

        if activation < FORGET_ACTIVATION:
            update_ids.append(drawer_id)
            update_metas.append({
                "deleted": True,
                "forgotten_at": str(int(now_ms)),
                "forgotten_activation": str(round(activation, 3)),
            })
            forgotten += 1

    if update_ids:
        _batch_update(col, update_ids, update_metas)

    return {"forgotten": forgotten}


def run_consolidation(palace_path: str | None = None) -> dict:
    """Run full consolidation pipeline: promote then forget."""
    cfg = MempalaceConfig()
    palace_path = palace_path or cfg.palace_path

    promotion = promote_drawers(palace_path)
    forgetting = forget_stale_drawers(palace_path)

    return {**promotion, **forgetting}
