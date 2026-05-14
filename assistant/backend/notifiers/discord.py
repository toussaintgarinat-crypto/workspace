import logging
import httpx

logger = logging.getLogger(__name__)

_SOURCE_COLORS = {
    "forge": 0x7c3aed,
    "oria": 0x0ea5e9,
    "mempalace": 0x10b981,
}


async def notify(title: str, body: str, webhook_url: str, source: str = "") -> bool:
    if not webhook_url:
        return False
    color = _SOURCE_COLORS.get(source, 0x6b6b6b)
    payload = {
        "embeds": [{
            "title": title,
            "description": body,
            "color": color,
        }]
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(webhook_url, json=payload)
        if r.status_code in (200, 204):
            return True
        logger.warning("Discord notify failed: %s", r.text)
        return False
    except Exception as e:
        logger.warning("Discord notify error: %s", e)
        return False
