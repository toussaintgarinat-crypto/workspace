"""RAG context fetcher — interroge MemPalace pour enrichir le chat.

S99 : utilise `S2SClient` (retry + circuit breaker). Si MemPalace est down ou
si le circuit est ouvert, on retourne `("", [])` au lieu de propager l'erreur
→ le chat continue sans contexte RAG (degradation gracieuse).
"""

import logging

from agent_personnel_shared.http_client import (
    S2SCircuitOpenError,
    S2SClient,
    S2SError,
)

from config import settings

logger = logging.getLogger(__name__)


async def fetch_rag_context(query: str, connections: list[dict]) -> tuple[str, list[dict]]:
    """Search MemPalace for relevant memories.

    Returns (system_context_block, sources_for_frontend).
    Returns ("", []) si RAG desactive, pas de connexion MemPalace, circuit ouvert,
    erreur reseau ou aucun resultat au-dessus du seuil.
    """
    if not settings.RAG_ENABLED:
        return "", []

    mp = next((c for c in connections if c.get("app_type") == "mempalace" and c.get("enabled")), None)
    if not mp:
        return "", []

    url = (mp.get("url") or "http://localhost:8100").rstrip("/")
    token = mp.get("token", "")
    client = S2SClient(base_url=url, token=token, service_name="mempalace", timeout=5.0)

    try:
        resp = await client.post(
            "/v1/api/search",
            json={"query": query, "n_results": settings.RAG_TOP_K},
        )
        data = resp.json()
    except S2SCircuitOpenError:
        # Fallback gracieux S99 : le chat continue sans contexte RAG.
        logger.warning("MemPalace circuit open — returning empty RAG sources")
        return "", []
    except S2SError as exc:
        logger.warning("RAG search failed (%s) — returning empty sources", exc)
        return "", []

    results = [r for r in data.get("results", []) if r.get("score", 0) >= settings.RAG_MIN_SCORE]
    if not results:
        return "", []

    lines = ["## Mémoire contextuelle (MemPalace)\n"]
    for r in results:
        meta = r.get("metadata", {})
        wing = meta.get("wing", "?")
        room = meta.get("room", "?")
        content = r.get("content", "").strip()
        lines.append(f"**[{wing} › {room}]** {content}")

    sources = [
        {
            "wing": r.get("metadata", {}).get("wing", ""),
            "room": r.get("metadata", {}).get("room", ""),
            "content": r.get("content", "").strip(),
            "score": round(r.get("score", 0), 3),
        }
        for r in results
    ]

    return "\n".join(lines), sources
