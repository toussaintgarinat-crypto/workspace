#!/usr/bin/env python3
"""
decay.py — ACT-R memory activation model for MemPalace.

Activation(i) = ln(Σ_j t_j^(-d)) + beta

Where:
  t_j  = hours since j-th access
  d    = decay rate (varies by memory type)
  beta = base constant (varies by memory type)

Status thresholds:
  activation >= -2.0  → "active"   (findable in search)
  activation >= -4.0  → "fading"   (deprioritised in ranking)
  activation <  -4.0  → "forgotten" (eligible for soft-delete)
"""

import math
import time
from datetime import datetime, timezone


DECAY_RATES: dict[str, dict[str, float]] = {
    "core":     {"d": 0.4, "beta": 3.0},
    "semantic": {"d": 0.5, "beta": 1.5},
    "episodic": {"d": 0.6, "beta": 0.5},
}

MAX_ACCESS_HISTORY = 20  # keep only last N accesses


def parse_access_times(access_times_str: str) -> list[float]:
    """Parse comma-separated ms-timestamp string to list of floats."""
    if not access_times_str:
        return []
    try:
        return [float(t) for t in access_times_str.split(",") if t.strip()]
    except ValueError:
        return []


def serialize_access_times(times: list[float]) -> str:
    """Serialize to comma-separated string, keeping only the last N entries."""
    trimmed = times[-MAX_ACCESS_HISTORY:]
    return ",".join(str(int(t)) for t in trimmed)


def compute_activation(
    access_times_str: str,
    memory_type: str = "episodic",
    created_at_str: str = "",
    now_ms: float | None = None,
) -> float:
    """
    Compute ACT-R activation for a memory.

    Returns 10.0 for core memories (never decay).
    Returns 0.0 when there is no access history and no created_at.
    """
    if now_ms is None:
        now_ms = time.time() * 1000

    if memory_type == "core":
        return 10.0

    access_times = parse_access_times(access_times_str)

    # Use filed_at/created_at as synthetic first access when history is empty
    if not access_times and created_at_str:
        try:
            dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            access_times = [dt.timestamp() * 1000]
        except (ValueError, AttributeError):
            pass

    if not access_times:
        return 0.0

    rates = DECAY_RATES.get(memory_type, DECAY_RATES["episodic"])
    d = rates["d"]
    beta = rates["beta"]

    total = 0.0
    for t in access_times:
        hours_since = max((now_ms - t) / 3_600_000, 0.001)
        total += math.pow(hours_since, -d)

    return (math.log(total) if total > 0 else -999.0) + beta


def get_decay_status(activation: float) -> str:
    if activation >= -2.0:
        return "active"
    if activation >= -4.0:
        return "fading"
    return "forgotten"


def apply_decay_boost(search_score: float, activation: float) -> float:
    """Blend vector similarity with activation: 80% score + 20% decay factor."""
    # Normalise activation: -4 → 0.0, +3 → 1.0
    normalized = min(1.0, max(0.0, (activation + 4) / 7))
    return search_score * 0.8 + normalized * 0.2
