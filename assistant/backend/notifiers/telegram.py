import logging
import httpx

logger = logging.getLogger(__name__)


async def notify(title: str, body: str, bot_token: str, chat_id: str) -> bool:
    if not bot_token or not chat_id:
        return False
    text = f"*{title}*\n{body}"
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "Markdown",
            })
        if r.is_success:
            return True
        logger.warning("Telegram notify failed: %s", r.text)
        return False
    except Exception as e:
        logger.warning("Telegram notify error: %s", e)
        return False
