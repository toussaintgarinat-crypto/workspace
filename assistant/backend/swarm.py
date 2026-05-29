import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from config import settings
from db import database
from agent import ReActAgent
from redis_client import NAMESPACE

logger = logging.getLogger(__name__)

# Registre local (best-effort) des jobs en cours sur CE réplica — sert
# uniquement à annuler une tâche encore vivante ici. Avec une file partagée
# (S125), un job peut tourner sur un autre réplica : on retombe alors sur un
# marquage DB que le worker honore avant de démarrer.
_local_running: dict[str, asyncio.Task] = {}
_subscribers: list[asyncio.Queue] = []
_listener_task: Optional[asyncio.Task] = None

_CHANNEL = "assistant:swarm:events"

# Stream de jobs durable (S125). Concurrence GLOBALE bornée par
# SWARM_MAX_WORKERS, tous réplicas confondus — fini le cap × N.
_JOB_STREAM = "swarm"
_JOB_GROUP = "workers"

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
                        import json
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
    import json
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
        # Annulation explicite (même réplica) — on suppress pour que le job
        # soit acquitté proprement par le worker.
        task = await _update_task_db(task_id, status="cancelled")
        await _broadcast({"type": "task_update", "task": task})

    except Exception as e:
        # On enregistre l'échec ET on le propage : le JobWorker relancera le
        # job (transitoire : gateway 5xx/429) puis le dirigera en DLQ après
        # SWARM_MAX_RETRIES tentatives via le hook _on_swarm_dlq.
        logger.error("Swarm worker %s error: %s", task_id, e)
        task = await _update_task_db(task_id, status="error", log=str(e))
        await _broadcast({"type": "task_update", "task": task})
        raise


# ── Worker durable (Redis Streams, S125) ─────────────────────────────────

async def _swarm_handler(payload: dict):
    """Handler de job : exécute un worker swarm, annulable sur ce réplica."""
    task_id = payload.get("task_id")
    if not task_id:
        return

    row = await database.fetch_one(
        "SELECT status, instructions, role FROM swarm_tasks WHERE id=:id", {"id": task_id}
    )
    if not row:
        logger.warning("swarm job %s introuvable en DB — ignoré", task_id)
        return
    if row["status"] in ("cancelled", "done", "review"):
        # Annulé avant démarrage ou déjà traité → on acquitte sans rejouer.
        return

    instructions = payload.get("instructions") or row["instructions"]
    role = payload.get("role") or row["role"]

    child = asyncio.create_task(_run_worker(task_id, instructions, role))
    _local_running[task_id] = child
    try:
        await child
    except asyncio.CancelledError:
        # _run_worker suppress déjà CancelledError ; si on arrive ici c'est une
        # annulation du job lui-même → on l'absorbe (pas de retry).
        pass
    finally:
        _local_running.pop(task_id, None)


async def _on_swarm_dlq(payload: dict, error: str):
    """Job définitivement échoué → état error visible sur le board + log."""
    task_id = payload.get("task_id")
    if not task_id:
        return
    try:
        task = await _update_task_db(
            task_id, status="error",
            log=f"[échec définitif après retries] {error}"[:4000],
        )
        await _broadcast({"type": "task_update", "task": task})
    except Exception as e:  # noqa: BLE001
        logger.warning("swarm DLQ hook error: %s", e)


_worker = None


def _get_worker():
    global _worker
    if _worker is None:
        from agent_personnel_shared.jobs import JobWorker
        cap = max(1, settings.SWARM_MAX_WORKERS)
        _worker = JobWorker(
            namespace=NAMESPACE,
            stream=_JOB_STREAM,
            group=_JOB_GROUP,
            handler=_swarm_handler,
            concurrency=cap,
            global_concurrency=cap,  # plafond GLOBAL, pas cap × N réplicas
            max_retries=settings.SWARM_MAX_RETRIES,
            on_dlq=_on_swarm_dlq,
        )
    return _worker


async def start_worker():
    """Lance le listener SSE + le worker durable (appelé au boot)."""
    await start_redis_listener()
    await _get_worker().start()


async def stop_worker():
    global _listener_task
    if _worker is not None:
        await _worker.stop()
    if _listener_task is not None:
        _listener_task.cancel()
        _listener_task = None


async def create_swarm_task(task_id: str, title: str, role: str, instructions: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    await database.execute(
        """
        INSERT INTO swarm_tasks (id, title, role, instructions, status, log, created_at)
        VALUES (:id, :title, :role, :instructions, 'ready', '', :now)
        """,
        {"id": task_id, "title": title, "role": role, "instructions": instructions, "now": now},
    )

    task: dict = {
        "id": task_id, "title": title, "role": role, "instructions": instructions,
        "status": "ready", "log": "", "created_at": now, "started_at": None, "completed_at": None,
    }
    await _broadcast({"type": "task_update", "task": task})

    # Empilé sur la file durable : un worker (n'importe quel réplica) le prendra
    # dès qu'un slot de concurrence globale se libère.
    await _get_worker().enqueue(
        {"task_id": task_id, "instructions": instructions, "role": role}
    )
    return task


async def cancel_swarm_task(task_id: str):
    job = _local_running.get(task_id)
    if job is not None:
        job.cancel()  # annulation immédiate (job vivant sur ce réplica)
    else:
        # Job pas (ou plus) sur ce réplica : marquage DB que le worker honore
        # avant de démarrer (s'il n'a pas encore commencé ailleurs).
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
