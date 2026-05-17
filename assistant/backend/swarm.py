import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from config import settings
from db import database
from agent import ReActAgent

logger = logging.getLogger(__name__)

_running: dict[str, asyncio.Task] = {}
_subscribers: list[asyncio.Queue] = []
_listener_task: Optional[asyncio.Task] = None
_start_lock: asyncio.Lock = asyncio.Lock()

_CHANNEL = "assistant:swarm:events"

ROLE_PROMPTS = {
    "builder":    "Tu es un agent Builder spécialisé dans la création de code, fichiers et structures.",
    "researcher": "Tu es un agent Researcher. Tu analyses et synthétises l'information depuis MemPalace et les apps connectées.",
    "ops":        "Tu es un agent Ops. Tu interagis avec Forge pour gérer tasks, sprints et opérations métier.",
    "qa":         "Tu es un agent QA. Tu vérifies, testes et produis des rapports de qualité.",
    "writer":     "Tu es un agent Writer. Tu rédiges, classes dans MemPalace et produis de la documentation.",
}


async def _redis_listener():
    from redis_client import redis_client
    if redis_client is None:
        return
    delay = 1
    while True:
        pubsub = redis_client.pubsub()
        try:
            await pubsub.subscribe(_CHANNEL)
            logger.info("swarm Redis listener subscribed to %s", _CHANNEL)
            delay = 1
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        event = json.loads(message["data"])
                        for q in list(_subscribers):
                            await q.put(event)
                    except Exception as e:
                        logger.debug("swarm listener parse error: %s", e)
        except asyncio.CancelledError:
            return
        except Exception as e:
            logger.warning("swarm Redis listener lost connection: %s — retrying in %ds", e, delay)
        finally:
            try:
                await pubsub.unsubscribe(_CHANNEL)
                await pubsub.aclose()
            except Exception:
                pass
        await asyncio.sleep(delay)
        delay = min(delay * 2, 60)


async def start_redis_listener():
    global _listener_task
    from redis_client import redis_client
    if redis_client and (_listener_task is None or _listener_task.done()):
        _listener_task = asyncio.create_task(_redis_listener())


async def _broadcast(event: dict):
    from redis_client import redis_client
    if redis_client:
        await redis_client.publish(_CHANNEL, json.dumps(event, ensure_ascii=False))
    else:
        for q in list(_subscribers):
            await q.put(event)


_ALLOWED_TASK_COLS = frozenset({"status", "log", "started_at", "completed_at"})


async def _update_task_db(task_id: str, **kwargs) -> dict:
    unknown = set(kwargs) - _ALLOWED_TASK_COLS
    if unknown:
        raise ValueError(f"Unknown swarm_tasks columns: {unknown}")
    set_clause = ", ".join(f"{k}=:{k}" for k in kwargs)
    await database.execute(
        f"UPDATE swarm_tasks SET {set_clause} WHERE id=:task_id",
        {**kwargs, "task_id": task_id},
    )
    row = await database.fetch_one(
        "SELECT * FROM swarm_tasks WHERE id=:task_id", {"task_id": task_id}
    )
    return dict(row) if row else {}


async def _run_worker(task_id: str, instructions: str, role: str):
    now = datetime.now(timezone.utc).isoformat()
    task = await _update_task_db(task_id, status="running", started_at=now)
    await _broadcast({"type": "task_update", "task": task})

    log_parts: list[str] = []

    try:
        from db import get_connections
        connections = await get_connections()
        active = [c for c in connections if c.get("enabled")]

        role_hint = ROLE_PROMPTS.get(role, "")
        agent = ReActAgent(active)
        _orig = agent.build_system_prompt

        def _patched(tool_names):
            base = _orig(tool_names)
            return f"{role_hint}\n\n{base}" if role_hint else base

        agent.build_system_prompt = _patched
        messages = [{"role": "user", "content": instructions}]

        async def on_chunk(chunk: dict):
            if chunk.get("type") == "text":
                log_parts.append(chunk.get("content", ""))

        await agent.stream_chat(messages, on_chunk)

        log = "".join(log_parts)
        now2 = datetime.now(timezone.utc).isoformat()
        task = await _update_task_db(task_id, status="review", log=log, completed_at=now2)
        await _broadcast({"type": "task_update", "task": task})

    except asyncio.CancelledError:
        task = await _update_task_db(task_id, status="cancelled")
        await _broadcast({"type": "task_update", "task": task})

    except Exception as e:
        logger.error("Swarm worker %s error: %s", task_id, e)
        task = await _update_task_db(task_id, status="error", log=str(e))
        await _broadcast({"type": "task_update", "task": task})

    finally:
        _running.pop(task_id, None)
        await _maybe_start_next()


async def _maybe_start_next():
    async with _start_lock:
        if len(_running) >= settings.SWARM_MAX_WORKERS:
            return
        row = await database.fetch_one(
            "SELECT * FROM swarm_tasks WHERE status='backlog' ORDER BY created_at LIMIT 1"
        )
        if not row:
            return
        task_id = row["id"]
        task_dict = dict(row)
        await database.execute(
            "UPDATE swarm_tasks SET status='ready' WHERE id=:task_id", {"task_id": task_id}
        )
        task_dict["status"] = "ready"
        await _broadcast({"type": "task_update", "task": task_dict})
        t = asyncio.create_task(_run_worker(task_id, task_dict["instructions"], task_dict["role"]))
        _running[task_id] = t


async def create_swarm_task(task_id: str, title: str, role: str, instructions: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    await database.execute(
        """
        INSERT INTO swarm_tasks (id, title, role, instructions, status, log, created_at)
        VALUES (:id, :title, :role, :instructions, 'backlog', '', :now)
        """,
        {"id": task_id, "title": title, "role": role, "instructions": instructions, "now": now},
    )

    task: dict = {
        "id": task_id, "title": title, "role": role, "instructions": instructions,
        "status": "backlog", "log": "", "created_at": now, "started_at": None, "completed_at": None,
    }
    await _broadcast({"type": "task_update", "task": task})

    async with _start_lock:
        if len(_running) < settings.SWARM_MAX_WORKERS:
            await database.execute(
                "UPDATE swarm_tasks SET status='ready' WHERE id=:task_id", {"task_id": task_id}
            )
            task["status"] = "ready"
            await _broadcast({"type": "task_update", "task": task})
            t = asyncio.create_task(_run_worker(task_id, instructions, role))
            _running[task_id] = t

    return task


async def cancel_swarm_task(task_id: str):
    if task_id in _running:
        _running[task_id].cancel()
    else:
        task = await _update_task_db(task_id, status="cancelled")
        await _broadcast({"type": "task_update", "task": task})


async def mark_task_done(task_id: str) -> dict:
    task = await _update_task_db(task_id, status="done")
    await _broadcast({"type": "task_update", "task": task})
    return task


async def list_swarm_tasks() -> list[dict]:
    rows = await database.fetch_all("SELECT * FROM swarm_tasks ORDER BY created_at DESC")
    return [dict(row) for row in rows]


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue):
    try:
        _subscribers.remove(q)
    except ValueError:
        pass
