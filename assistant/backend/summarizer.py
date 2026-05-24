import logging
from datetime import datetime, timezone

from openai import AsyncOpenAI

from agent_personnel_shared.http_client import S2SClient, S2SError

from config import settings

logger = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = (
    "Tu es un assistant spécialisé dans la synthèse de conversations. "
    "Produis un résumé concis en 3 à 5 bullet points markdown (commençant par `- `) "
    "couvrant les sujets principaux abordés dans la conversation. "
    "Sois factuel, dense et utile pour retrouver cette session plus tard. "
    "Réponds uniquement avec les bullet points, sans titre ni texte introductif."
)


_MAX_CHARS = 32_000


async def summarize_conversation(messages: list[dict], llm_client: AsyncOpenAI) -> str:
    conversation_text = "\n".join(
        f"[{m['role'].upper()}] {m.get('content', '')}"
        for m in messages
        if m.get("content")
    )
    if len(conversation_text) > _MAX_CHARS:
        conversation_text = conversation_text[-_MAX_CHARS:]
    resp = await llm_client.chat.completions.create(
        model=settings.GATEWAY_MODEL,
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": f"Résume cette conversation :\n\n{conversation_text}"},
        ],
        stream=False,
    )
    return resp.choices[0].message.content or ""


async def store_summary_in_mempalace(summary: str, connections: list, date_str: str) -> bool:
    mp = next(
        (c for c in connections if c.get("app_type") == "mempalace" and c.get("enabled")),
        None,
    )
    if not mp:
        return False

    url = mp.get("url") or "http://localhost:8100"
    token = mp.get("token", "")
    room = date_str
    client = S2SClient(base_url=url, token=token, service_name="mempalace", timeout=10.0)

    try:
        await client.post(
            "/v1/api/drawers",
            json={
                "content": summary,
                "wing": "conversations",
                "room": room,
                "metadata": {
                    "source": "assistant-summarizer",
                    "date": date_str,
                    "added_at": datetime.now(timezone.utc).isoformat(),
                },
            },
        )
        return True
    except S2SError as e:
        logger.warning("Failed to store summary in MemPalace: %s", e)
        return False
