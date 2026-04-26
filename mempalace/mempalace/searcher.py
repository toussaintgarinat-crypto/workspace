#!/usr/bin/env python3
"""
searcher.py — Find anything. Exact words.

Semantic search against the palace.
Returns verbatim text — the actual words, never summaries.
"""

import sys
import time
from pathlib import Path

from .storage import get_palace_storage

from .decay import (
    apply_decay_boost,
    compute_activation,
    parse_access_times,
    serialize_access_times,
)


def search(query: str, palace_path: str, wing: str = None, room: str = None, n_results: int = 5):
    """
    Search the palace. Returns verbatim drawer content.
    Optionally filter by wing (project) or room (aspect).
    """
    col = get_palace_storage(palace_path, create=False)
    if col is None:
        print(f"\n  No palace found at {palace_path}")
        print("  Run: mempalace init <dir> then mempalace mine <dir>")
        sys.exit(1)

    # Build where filter
    where = {}
    if wing and room:
        where = {"$and": [{"wing": wing}, {"room": room}]}
    elif wing:
        where = {"wing": wing}
    elif room:
        where = {"room": room}

    try:
        kwargs = {
            "query_texts": [query],
            "n_results": n_results,
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where

        results = col.query(**kwargs)

    except Exception as e:
        print(f"\n  Search error: {e}")
        sys.exit(1)

    docs = results["documents"][0]
    metas = results["metadatas"][0]
    dists = results["distances"][0]

    if not docs:
        print(f'\n  No results found for: "{query}"')
        return

    print(f"\n{'=' * 60}")
    print(f'  Results for: "{query}"')
    if wing:
        print(f"  Wing: {wing}")
    if room:
        print(f"  Room: {room}")
    print(f"{'=' * 60}\n")

    for i, (doc, meta, dist) in enumerate(zip(docs, metas, dists), 1):
        similarity = round(1 - dist, 3)
        source = Path(meta.get("source_file", "?")).name
        wing_name = meta.get("wing", "?")
        room_name = meta.get("room", "?")

        print(f"  [{i}] {wing_name} / {room_name}")
        print(f"      Source: {source}")
        print(f"      Match:  {similarity}")
        print()
        # Print the verbatim text, indented
        for line in doc.strip().split("\n"):
            print(f"      {line}")
        print()
        print(f"  {'─' * 56}")

    print()


def _update_access(col, drawer_id: str, meta: dict) -> None:
    """Append current timestamp to access_times and increment access_count."""
    now_ms = int(time.time() * 1000)
    existing = parse_access_times(meta.get("access_times", ""))
    existing.append(now_ms)
    new_count = int(meta.get("access_count", 0)) + 1
    col.update(
        ids=[drawer_id],
        metadatas=[{
            "access_times": serialize_access_times(existing),
            "access_count": new_count,
        }],
    )


def search_memories(
    query: str,
    palace_path: str,
    wing: str = None,
    room: str = None,
    n_results: int = 5,
    track_access: bool = True,
) -> dict:
    """
    Programmatic search — returns a dict instead of printing.
    Used by the MCP server and other callers that need data.

    Results are re-ranked by blending vector similarity with ACT-R activation
    (80% similarity + 20% decay boost). Access times are tracked unless
    track_access=False.
    """
    col = get_palace_storage(palace_path, create=False)
    if col is None:
        return {"error": f"No palace found at {palace_path}"}

    # Build where filter
    where = {}
    if wing and room:
        where = {"$and": [{"wing": wing}, {"room": room}]}
    elif wing:
        where = {"wing": wing}
    elif room:
        where = {"room": room}

    try:
        kwargs = {
            "query_texts": [query],
            "n_results": n_results,
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where

        results = col.query(**kwargs)
    except Exception as e:
        return {"error": f"Search error: {e}"}

    drawer_ids = results["ids"][0]
    docs = results["documents"][0]
    metas = results["metadatas"][0]
    dists = results["distances"][0]

    now_ms = time.time() * 1000
    hits = []
    for drawer_id, doc, meta, dist in zip(drawer_ids, docs, metas, dists):
        similarity = round(1 - dist, 3)
        activation = compute_activation(
            access_times_str=meta.get("access_times", ""),
            memory_type=meta.get("memory_type", "episodic"),
            created_at_str=meta.get("filed_at", ""),
            now_ms=now_ms,
        )
        boosted_score = apply_decay_boost(similarity, activation)

        if track_access:
            _update_access(col, drawer_id, meta)

        hits.append({
            "text": doc,
            "wing": meta.get("wing", "unknown"),
            "room": meta.get("room", "unknown"),
            "source_file": Path(meta.get("source_file", "?")).name,
            "similarity": similarity,
            "score": round(boosted_score, 3),
            "activation": round(activation, 2),
            "memory_type": meta.get("memory_type", "episodic"),
        })

    # Re-rank by blended score
    hits.sort(key=lambda h: h["score"], reverse=True)

    return {
        "query": query,
        "filters": {"wing": wing, "room": room},
        "results": hits,
    }
