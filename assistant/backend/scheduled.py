import asyncio
import logging
import uuid as _uuid
from datetime import datetime, timezone, timedelta

from db import database, get_connections
from config import settings
from leader import is_leader
from notifiers import inapp as inapp_notifier

logger = logging.getLogger(__name__)

_scheduler_task: asyncio.Task | None = None


async def init_scheduled_table():
    await database.execute("""
        CREATE TABLE IF NOT EXISTS scheduled_prompts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            schedule TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            last_run TEXT,
            next_run TEXT,
            created_at TEXT NOT NULL
        )
    """)


async def list_scheduled() -> list[dict]:
    rows = await database.fetch_all(
        "SELECT * FROM scheduled_prompts ORDER BY created_at DESC"
    )
    return [dict(r) for r in rows]


async def get_scheduled(prompt_id: str) -> dict | None:
    row = await database.fetch_one(
        "SELECT * FROM scheduled_prompts WHERE id = :id", {"id": prompt_id}
    )
    return dict(row) if row else None


async def create_scheduled(title: str, prompt: str, schedule: str) -> dict:
    prompt_id = str(_uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    next_run = _compute_next_run(schedule)
    await database.execute(
        """
        INSERT INTO scheduled_prompts (id, title, prompt, schedule, active, next_run, created_at)
        VALUES (:id, :title, :prompt, :schedule, 1, :next_run, :now)
        """,
        {"id": prompt_id, "title": title, "prompt": prompt,
         "schedule": schedule, "next_run": next_run, "now": now},
    )
    return await get_scheduled(prompt_id)


async def update_scheduled(prompt_id: str, **fields) -> dict | None:
    allowed = {"title", "prompt", "schedule", "active"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return await get_scheduled(prompt_id)
    if "active" in updates:
        updates["active"] = int(updates["active"])
    if "schedule" in updates:
        next_run = _compute_next_run(updates["schedule"])
        updates["next_run"] = next_run
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    await database.execute(
        f"UPDATE scheduled_prompts SET {set_clause} WHERE id = :id",
        {**updates, "id": prompt_id},
    )
    return await get_scheduled(prompt_id)


async def delete_scheduled(prompt_id: str):
    await database.execute(
        "DELETE FROM scheduled_prompts WHERE id = :id", {"id": prompt_id}
    )


async def run_now(prompt_id: str) -> dict:
    """Execute a scheduled prompt immediately."""
    row = await get_scheduled(prompt_id)
    if not row:
        return {"ok": False, "error": "Not found"}

    connections = await get_connections()
    active = [c for c in connections if c.get("enabled")]

    from openai import AsyncOpenAI
    from agent import ReActAgent

    llm_client = AsyncOpenAI(
        base_url=f"{settings.GATEWAY_URL}/v1",
        api_key=settings.GATEWAY_API_KEY,
    )
    agent = ReActAgent(active)
    collected: list[str] = []

    async def on_chunk(chunk: dict):
        if chunk.get("type") == "text":
            collected.append(chunk.get("content", ""))

    await agent.stream_chat(
        [{"role": "user", "content": row["prompt"]}],
        on_chunk,
    )

    result = "".join(collected)
    now = datetime.now(timezone.utc).isoformat()
    # S123 : on ne touche plus `next_run` ici. Il est avancé *avant* le dispatch
    # par `_claim_due` (le scheduler) ou par create/update_scheduled. Le faire
    # ici (après un stream qui peut dépasser 60 s) rouvrait une fenêtre de
    # double exécution au tick suivant.
    await database.execute(
        "UPDATE scheduled_prompts SET last_run = :now WHERE id = :id",
        {"now": now, "id": prompt_id},
    )

    await inapp_notifier.broadcast({
        "type": "scheduled_result",
        "prompt_id": prompt_id,
        "title": row["title"],
        "result": result[:500],
    })

    return {"ok": True, "result": result, "prompt_id": prompt_id}


def _compute_next_run(schedule: str) -> str:
    """Compute next ISO run time.
    Supported formats:
      hourly
      daily HH:MM
      weekly mon|tue|wed|thu|fri|sat|sun HH:MM
    """
    now = datetime.now(timezone.utc)
    try:
        parts = schedule.lower().split()
        if parts[0] == "hourly":
            return (now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)).isoformat()
        elif parts[0] == "daily" and len(parts) >= 2:
            h, m = map(int, parts[1].split(":"))
            candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
            if candidate <= now:
                candidate += timedelta(days=1)
            return candidate.isoformat()
        elif parts[0] == "weekly" and len(parts) >= 3:
            days = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
            target_day = days.get(parts[1], 0)
            h, m = map(int, parts[2].split(":"))
            days_ahead = (target_day - now.weekday()) % 7
            candidate = (now + timedelta(days=days_ahead)).replace(hour=h, minute=m, second=0, microsecond=0)
            if candidate <= now:
                candidate += timedelta(weeks=1)
            return candidate.isoformat()
    except Exception:
        pass
    return (now + timedelta(hours=1)).isoformat()


async def _claim_due(now: str) -> list[str]:
    """Sélectionne les prompts dus et avance leur `next_run` de façon atomique
    *avant* tout dispatch (S123).

    Le claim ferme la course : un tick suivant (ou un autre réplica pendant un
    transfert de leadership) re-SELECT ne retombera plus sur la même ligne,
    puisque `next_run` est déjà repoussé dans le futur. L'``UPDATE ... WHERE
    next_run <= :now`` garantit qu'on ne réclame que ce qui était réellement dû.

    Retourne les ids réclamés, à dispatcher ensuite via ``run_now``.
    """
    rows = await database.fetch_all(
        "SELECT id, schedule FROM scheduled_prompts WHERE active = 1 AND next_run <= :now",
        {"now": now},
    )
    claimed: list[str] = []
    for row in rows:
        new_next = _compute_next_run(row["schedule"])
        await database.execute(
            "UPDATE scheduled_prompts SET next_run = :next_run "
            "WHERE id = :id AND next_run <= :now",
            {"next_run": new_next, "id": row["id"], "now": now},
        )
        claimed.append(row["id"])
    return claimed


async def _scheduler_loop():
    while True:
        try:
            await asyncio.sleep(60)
            # S123 : ne tourner que sur le réplica leader (clé partagée avec
            # proactive). Sans ça, chaque réplica déclencherait chaque prompt.
            if not await is_leader():
                continue
            now = datetime.now(timezone.utc).isoformat()
            for prompt_id in await _claim_due(now):
                asyncio.create_task(run_now(prompt_id))
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Scheduled prompt loop error: %s", e)


def start_scheduler():
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(_scheduler_loop())


def stop_scheduler():
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
