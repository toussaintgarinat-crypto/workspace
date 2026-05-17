import asyncio
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_subscribers: list[asyncio.Queue] = []
_listener_task: Optional[asyncio.Task] = None

_CHANNEL = "assistant:inapp"


async def _redis_listener():
    from redis_client import redis_client
    if redis_client is None:
        return
    delay = 1
    while True:
        pubsub = redis_client.pubsub()
        try:
            await pubsub.subscribe(_CHANNEL)
            logger.info("inapp Redis listener subscribed to %s", _CHANNEL)
            delay = 1
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        event = json.loads(message["data"])
                        for q in list(_subscribers):
                            await q.put(event)
                    except Exception as e:
                        logger.debug("inapp listener parse error: %s", e)
        except asyncio.CancelledError:
            return
        except Exception as e:
            logger.warning("inapp Redis listener lost connection: %s — retrying in %ds", e, delay)
        finally:
            try:
                await pubsub.unsubscribe(_CHANNEL)
                await pubsub.aclose()
            except Exception:
                pass
        await asyncio.sleep(delay)
        delay = min(delay * 2, 60)


async def start():
    global _listener_task
    from redis_client import redis_client
    if redis_client and (_listener_task is None or _listener_task.done()):
        _listener_task = asyncio.create_task(_redis_listener())


async def stop():
    global _listener_task
    if _listener_task and not _listener_task.done():
        _listener_task.cancel()
        _listener_task = None


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue):
    try:
        _subscribers.remove(q)
    except ValueError:
        pass


async def broadcast(event: dict):
    from redis_client import redis_client
    if redis_client:
        # All replicas receive this via their own _redis_listener
        await redis_client.publish(_CHANNEL, json.dumps(event, ensure_ascii=False))
    else:
        for q in list(_subscribers):
            await q.put(event)


async def notify(title: str, body: str, source: str, event_type: str, alert_id: str):
    await broadcast({
        "type": "alert",
        "id": alert_id,
        "title": title,
        "body": body,
        "source": source,
        "event_type": event_type,
    })
