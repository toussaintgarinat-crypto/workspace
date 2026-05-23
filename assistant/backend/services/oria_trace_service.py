"""Post a trace card to the ``assistant-traces`` Oria room."""

import logging
from datetime import datetime, timezone

from tools.oria import OriaTools

logger = logging.getLogger(__name__)


async def post_oria_trace(
    active: list[dict],
    raw_prompt: str,
    refined_data: dict | None,
    tools_used: list[str],
    result_content: str,
) -> None:
    oria_conn = next(
        (c for c in active if c.get("app_type") == "oria" and c.get("enabled")), None
    )
    if not oria_conn:
        return
    oria = OriaTools(oria_conn["url"], oria_conn["token"])
    try:
        rooms = await oria.list_rooms()
        traces_room = next(
            (r for r in rooms if r.get("name") == "assistant-traces"), None
        )
        if not traces_room:
            return
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines = [f"**📋 Trace assistant** — {ts}"]
        lines.append(
            f"**Prompt brut :** {raw_prompt[:300]}{'…' if len(raw_prompt) > 300 else ''}"
        )
        if refined_data:
            rp = refined_data.get("refined_prompt", "")
            lines.append(f"**Prompt affiné :** {rp[:300]}{'…' if len(rp) > 300 else ''}")
            lines.append(f"**Intent :** {refined_data.get('interpreted_intent', '')}")
            lines.append(f"**Confiance :** {refined_data.get('confidence', 'N/A')}")
            flags = refined_data.get("uncertainty_flags", [])
            if flags:
                lines.append(f"**Incertitudes :** {', '.join(flags)}")
        if tools_used:
            lines.append(f"**Outils :** {', '.join(tools_used)}")
        if result_content:
            snippet = result_content[:400]
            lines.append(
                f"**Réponse :** {snippet}{'…' if len(result_content) > 400 else ''}"
            )
        await oria.post_message(traces_room["id"], "\n".join(lines))
    except Exception as e:
        logger.warning("Failed to post trace to Oria: %s", e)
