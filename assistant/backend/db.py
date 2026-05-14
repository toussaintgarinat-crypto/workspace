import aiosqlite
import json
import uuid
from datetime import datetime
from config import settings

DB_PATH = settings.DB_PATH


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                token TEXT NOT NULL,
                app_type TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_tokens (
                user_sub TEXT NOT NULL,
                app_type TEXT NOT NULL,
                access_token_enc BLOB,
                refresh_token_enc BLOB,
                expires_at TEXT,
                PRIMARY KEY (user_sub, app_type)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS swarm_tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                role TEXT NOT NULL,
                instructions TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'backlog',
                log TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS voice_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                stt_provider TEXT NOT NULL DEFAULT 'webspeech',
                tts_provider TEXT NOT NULL DEFAULT 'webspeech',
                stt_api_key_enc BLOB,
                tts_api_key_enc BLOB,
                language TEXT NOT NULL DEFAULT 'fr-FR',
                tts_voice TEXT NOT NULL DEFAULT 'alloy',
                updated_at TEXT
            )
        """)
        await db.execute("""
            INSERT OR IGNORE INTO voice_settings (id, stt_provider, tts_provider, language, tts_voice)
            VALUES (1, 'webspeech', 'webspeech', 'fr-FR', 'alloy')
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS proactive_config (
                id INTEGER PRIMARY KEY DEFAULT 1,
                enabled INTEGER NOT NULL DEFAULT 0,
                interval_minutes INTEGER NOT NULL DEFAULT 30,
                reminder_hours INTEGER NOT NULL DEFAULT 0,
                events_config TEXT NOT NULL DEFAULT '{}',
                channels_config TEXT NOT NULL DEFAULT '{}'
            )
        """)
        await db.execute("""
            INSERT OR IGNORE INTO proactive_config
                (id, enabled, interval_minutes, reminder_hours, events_config, channels_config)
            VALUES (1, 0, 30, 0, '{"forge":{"overdue_tasks":true,"overdue_sprints":false},"oria":{"unread_messages":true},"mempalace":{"stale_entries":false}}', '{"inapp":true,"telegram":{"enabled":false,"bot_token":"","chat_id":""},"discord":{"enabled":false,"webhook_url":""}}')
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS proactive_alerts (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                event_type TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0,
                channels_sent TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            )
        """)
        await db.commit()


async def get_connections() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM connections ORDER BY created_at") as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


async def upsert_connection(
    id: str,
    name: str,
    url: str,
    token: str,
    app_type: str,
    enabled: bool,
) -> dict:
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO connections (id, name, url, token, app_type, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                url=excluded.url,
                token=excluded.token,
                app_type=excluded.app_type,
                enabled=excluded.enabled
            """,
            (id, name, url, token, app_type, int(enabled), now),
        )
        await db.commit()
    return {"id": id, "name": name, "url": url, "token": token, "app_type": app_type, "enabled": enabled, "created_at": now}


async def delete_connection(id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM connections WHERE id = ?", (id,))
        await db.commit()


async def get_voice_settings() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM voice_settings WHERE id = 1") as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else {}


async def upsert_voice_settings(
    stt_provider: str,
    tts_provider: str,
    stt_api_key_enc: bytes | None,
    tts_api_key_enc: bytes | None,
    language: str,
    tts_voice: str,
):
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE voice_settings SET
                stt_provider = ?,
                tts_provider = ?,
                stt_api_key_enc = ?,
                tts_api_key_enc = ?,
                language = ?,
                tts_voice = ?,
                updated_at = ?
            WHERE id = 1
            """,
            (stt_provider, tts_provider, stt_api_key_enc, tts_api_key_enc, language, tts_voice, now),
        )
        await db.commit()


# ── Proactive config ─────────────────────────────────────────────────────────

async def get_proactive_config() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM proactive_config WHERE id = 1") as cur:
            row = await cur.fetchone()
            if not row:
                return {}
            d = dict(row)
            d["events_config"] = json.loads(d["events_config"])
            d["channels_config"] = json.loads(d["channels_config"])
            return d


async def upsert_proactive_config(
    enabled: bool,
    interval_minutes: int,
    reminder_hours: int,
    events_config: dict,
    channels_config: dict,
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE proactive_config SET
                enabled = ?,
                interval_minutes = ?,
                reminder_hours = ?,
                events_config = ?,
                channels_config = ?
            WHERE id = 1
            """,
            (int(enabled), interval_minutes, reminder_hours,
             json.dumps(events_config), json.dumps(channels_config)),
        )
        await db.commit()


async def add_alert(source: str, event_type: str, title: str, body: str, channels_sent: list) -> str:
    alert_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO proactive_alerts (id, source, event_type, title, body, read, channels_sent, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (alert_id, source, event_type, title, body, json.dumps(channels_sent), now),
        )
        await db.commit()
    return alert_id


async def get_alerts(unread_only: bool = False, limit: int = 100) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        q = "SELECT * FROM proactive_alerts"
        if unread_only:
            q += " WHERE read = 0"
        q += " ORDER BY created_at DESC LIMIT ?"
        async with db.execute(q, (limit,)) as cur:
            rows = await cur.fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d["channels_sent"] = json.loads(d["channels_sent"])
                d["read"] = bool(d["read"])
                result.append(d)
            return result


async def mark_alert_read(alert_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE proactive_alerts SET read = 1 WHERE id = ?", (alert_id,))
        await db.commit()


async def count_unread_alerts() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM proactive_alerts WHERE read = 0") as cur:
            row = await cur.fetchone()
            return row[0] if row else 0
