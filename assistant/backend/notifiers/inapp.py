import asyncio
from typing import Callable

_subscribers: list[asyncio.Queue] = []


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
