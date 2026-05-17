import logging
import httpx
from config import settings

logger = logging.getLogger(__name__)


async def fetch_rag_context(query: str, connections: list[dict]) -> tuple[str, list[dict]]:
    """Search MemPalace for relevant memories.

    Returns (system_context_block, sources_for_frontend).
    Returns ("", []) if RAG is disabled, no MemPalace connection, or no results above threshold.
    """
    if not settings.RAG_ENABLED:
        return "", []

    mp = next((c for c in connections if c.get("app_type") == "mempalace" and c.get("enabled")), None)
    if not mp:
        return "", []

    url = (mp.get("url") or "http://localhost:8100").rstrip("/")
    token = mp.get("token", "")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{url}/api/search",
                json={"query": query, "n_results": settings.RAG_TOP_K},
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("RAG search failed: %s", e)
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
