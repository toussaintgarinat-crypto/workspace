import asyncio
import logging
import uuid as _uuid
from datetime import datetime, timezone, timedelta

import httpx

from db import (
    get_connections, get_proactive_config,
    add_alert, count_unread_alerts,
)
from notifiers import inapp as inapp_notifier
from notifiers import telegram as telegram_notifier
from notifiers import discord as discord_notifier
import push as push_mod
from metrics import proactive_alerts_total

logger = logging.getLogger(__name__)

_scheduler_task: asyncio.Task | None = None
_last_check: str | None = None
_enabled_since: datetime | None = None

# Unique ID for this process — used for Redis leader election
_replica_id = str(_uuid.uuid4())[:8]
_LEADER_KEY = "assistant:scheduler:leader"
_LEADER_TTL = 90  # seconds


# ── Leader election ──────────────────────────────────────────────────────────

_RENEW_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('expire', KEYS[1], ARGV[2])
else
    return 0
end
"""


async def _is_leader() -> bool:
    """Returns True if this replica should run the scheduler.
    Without Redis: always True (single-instance mode).
    With Redis: uses SET NX to elect exactly one leader."""
    from redis_client import redis_client
    if not redis_client:
        return True
    acquired = await redis_client.set(_LEADER_KEY, _replica_id, nx=True, ex=_LEADER_TTL)
    if acquired:
        return True
    renewed = await redis_client.eval(_RENEW_SCRIPT, 1, _LEADER_KEY, _replica_id, str(_LEADER_TTL))
    return bool(renewed)


async def _release_leader():
    from redis_client import redis_client
    if not redis_client:
        return
    current = await redis_client.get(_LEADER_KEY)
    if current == _replica_id:
        await redis_client.delete(_LEADER_KEY)


# ── Dispatcher ───────────────────────────────────────────────────────────────

async def _dispatch(title: str, body: str, source: str, event_type: str, cfg: dict):
    channels_config: dict = cfg.get("channels_config", {})
    channels_sent = []

    # Collect channels first, then persist the alert with accurate channels_sent
    proactive_alerts_total.inc()

    if channels_config.get("inapp", True):
        channels_sent.append("inapp")

    tg = channels_config.get("telegram", {})
    if tg.get("enabled") and tg.get("bot_token") and tg.get("chat_id"):
        ok = await telegram_notifier.notify(title, body, tg["bot_token"], tg["chat_id"])
        if ok:
            channels_sent.append("telegram")

    disc = channels_config.get("discord", {})
    if disc.get("enabled") and disc.get("webhook_url"):
        ok = await discord_notifier.notify(title, body, disc["webhook_url"], source)
        if ok:
            channels_sent.append("discord")

    try:
        n = await push_mod.send_push_to_all({"title": title, "body": body, "tag": f"{source}_{event_type}"})
        if n > 0:
            channels_sent.append("webpush")
    except Exception as e:
        logger.debug("WebPush send failed: %s", e)

    # Persist alert with the actual channels that were used
    alert_id = await add_alert(source, event_type, title, body, channels_sent)

    # Send in-app notification after the alert_id is known
    if "inapp" in channels_sent:
        await inapp_notifier.notify(title, body, source, event_type, alert_id)

    return alert_id, channels_sent


# ── Event checkers ───────────────────────────────────────────────────────────

async def _check_forge(cfg: dict, connections: list[dict]):
    events: dict = cfg.get("events_config", {}).get("forge", {})
    if not any(events.values()):
        return

    conn = next((c for c in connections if c.get("app_type") == "forge" and c.get("enabled")), None)
    if not conn:
        return

    headers = {"Authorization": f"Bearer {conn['token']}"}
    base = conn["url"].rstrip("/")

    if events.get("overdue_tasks"):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{base}/api/tasks", headers=headers, params={"status": "todo,in_progress"})
            if r.is_success:
                today = datetime.now(timezone.utc).date()
                overdue = [
                    t for t in r.json()
                    if t.get("due_date") and datetime.fromisoformat(t["due_date"]).date() < today
                ]
                if overdue:
                    names = ", ".join(t.get("title", t.get("id", "?")) for t in overdue[:5])
                    suffix = f" (+{len(overdue)-5} autres)" if len(overdue) > 5 else ""
                    await _dispatch(
                        f"Forge — {len(overdue)} tâche(s) en retard",
                        f"{names}{suffix}",
                        "forge", "overdue_tasks", cfg,
                    )
        except Exception as e:
            logger.warning("Forge overdue_tasks check failed: %s", e)

    if events.get("overdue_sprints"):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{base}/api/sprints", headers=headers)
            if r.is_success:
                today = datetime.now(timezone.utc).date()
                overdue = [
                    s for s in r.json()
                    if s.get("end_date") and datetime.fromisoformat(s["end_date"]).date() < today
                    and s.get("status") not in ("completed", "done", "closed")
                ]
                if overdue:
                    names = ", ".join(s.get("name", s.get("id", "?")) for s in overdue[:3])
                    await _dispatch(
                        f"Forge — {len(overdue)} sprint(s) dépassé(s)",
                        names,
                        "forge", "overdue_sprints", cfg,
                    )
        except Exception as e:
            logger.warning("Forge overdue_sprints check failed: %s", e)


async def _check_oria(cfg: dict, connections: list[dict]):
    events: dict = cfg.get("events_config", {}).get("oria", {})
    if not events.get("unread_messages"):
        return

    conn = next((c for c in connections if c.get("app_type") == "oria" and c.get("enabled")), None)
    if not conn:
        return

    headers = {"Authorization": f"Bearer {conn['token']}"}
    base = conn["url"].rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{base}/api/rooms", headers=headers)
        if not r.is_success:
            return
        rooms = r.json()
        stale_cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        rooms_with_unread = []
        async with httpx.AsyncClient(timeout=10) as client:
            for room in rooms[:20]:
                try:
                    mr = await client.get(
                        f"{base}/api/rooms/{room['id']}/messages",
                        headers=headers,
                        params={"limit": 5},
                    )
                    if mr.is_success:
                        msgs = mr.json()
                        recent = [
                            m for m in msgs
                            if m.get("created_at") and
                            datetime.fromisoformat(m["created_at"].replace("Z", "+00:00")) > stale_cutoff
                        ]
                        if recent:
                            rooms_with_unread.append(room.get("name", room["id"]))
                except Exception:
                    continue

        if rooms_with_unread:
            rooms_str = ", ".join(rooms_with_unread[:5])
            await _dispatch(
                f"Oria — {len(rooms_with_unread)} room(s) avec messages récents",
                f"Activité dans : {rooms_str}",
                "oria", "unread_messages", cfg,
            )
    except Exception as e:
        logger.warning("Oria unread_messages check failed: %s", e)


async def _check_mempalace(cfg: dict, connections: list[dict]):
    events: dict = cfg.get("events_config", {}).get("mempalace", {})
    if not events.get("stale_entries"):
        return

    conn = next((c for c in connections if c.get("app_type") == "mempalace" and c.get("enabled")), None)
    if not conn:
        return

    headers = {"Authorization": f"Bearer {conn['token']}"}
    base = conn["url"].rstrip("/")

    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{base}/api/drawers", headers=headers, params={"limit": 100})
        if r.is_success:
            entries = r.json()
            stale = []
            for e in entries:
                if not e.get("created_at"):
                    continue
                if e.get("created_at", "") < cutoff and e.get("updated_at", e.get("created_at")) == e.get("created_at"):
                    stale.append(e)
            if stale:
                await _dispatch(
                    f"MemPalace — {len(stale)} entrée(s) sans suite depuis 7j",
                    "Ces entrées n'ont pas été mises à jour depuis plus d'une semaine.",
                    "mempalace", "stale_entries", cfg,
                )
    except Exception as e:
        logger.warning("MemPalace stale_entries check failed: %s", e)


# ── Reminder ─────────────────────────────────────────────────────────────────

async def _maybe_send_reminder(cfg: dict):
    global _enabled_since
    reminder_hours = cfg.get("reminder_hours", 0)
    if not reminder_hours or not _enabled_since:
        return
    delta = datetime.now(timezone.utc) - _enabled_since
    if delta >= timedelta(hours=reminder_hours):
        await _dispatch(
            "Mode proactif actif depuis longtemps",
            f"Le mode surveillance est actif depuis {int(delta.total_seconds() // 3600)}h. "
            "Pense à le désactiver si tu veux la paix.",
            "assistant", "reminder", cfg,
        )
        _enabled_since = datetime.now(timezone.utc)


# ── Main check ───────────────────────────────────────────────────────────────

async def run_check():
    global _last_check
    cfg = await get_proactive_config()
    if not cfg:
        return
    connections = await get_connections()
    _last_check = datetime.now(timezone.utc).isoformat()
    logger.info("Proactive check started at %s (replica %s)", _last_check, _replica_id)

    await asyncio.gather(
        _check_forge(cfg, connections),
        _check_oria(cfg, connections),
        _check_mempalace(cfg, connections),
        return_exceptions=True,
    )
    await _maybe_send_reminder(cfg)

    unread = await count_unread_alerts()
    await inapp_notifier.broadcast({"type": "badge_update", "unread_count": unread})
    logger.info("Proactive check done. Unread alerts: %d", unread)


# ── Scheduler ────────────────────────────────────────────────────────────────

async def _scheduler_loop():
    global _enabled_since
    while True:
        if not await _is_leader():
            await asyncio.sleep(60)
            continue

        cfg = await get_proactive_config()
        if not cfg.get("enabled"):
            _enabled_since = None
            await asyncio.sleep(60)
            continue

        if _enabled_since is None:
            _enabled_since = datetime.now(timezone.utc)

        try:
            await run_check()
        except Exception as e:
            logger.error("Proactive scheduler error: %s", e)

        interval = cfg.get("interval_minutes", 30) * 60

        # Sleep in 60s chunks so we keep refreshing the leader lock
        elapsed = 0
        while elapsed < interval:
            chunk = min(60, interval - elapsed)
            await asyncio.sleep(chunk)
            elapsed += chunk
            if not await _is_leader():
                # Lost leadership mid-sleep, back to top
                break


def start_scheduler():
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(_scheduler_loop())
        logger.info("Proactive scheduler started (replica %s)", _replica_id)


def stop_scheduler():
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        _scheduler_task = None


def get_status() -> dict:
    return {
        "scheduler_running": _scheduler_task is not None and not _scheduler_task.done(),
        "last_check": _last_check,
        "enabled_since": _enabled_since.isoformat() if _enabled_since else None,
        "replica_id": _replica_id,
    }
