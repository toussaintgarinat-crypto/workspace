import json
import uuid
from datetime import datetime, timezone

import databases
from config import settings

_db_url = settings.DATABASE_URL if settings.DATABASE_URL else f"sqlite+aiosqlite:///{settings.DB_PATH}"
_is_pg = _db_url.startswith("postgresql")
_BLOB = "BYTEA" if _is_pg else "BLOB"

database = databases.Database(_db_url)


async def init_db():
    await database.connect()

    await database.execute("""
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

    await database.execute(f"""
        CREATE TABLE IF NOT EXISTS user_tokens (
            user_sub TEXT NOT NULL,
            app_type TEXT NOT NULL,
            access_token_enc {_BLOB},
            refresh_token_enc {_BLOB},
            expires_at TEXT,
            PRIMARY KEY (user_sub, app_type)
        )
    """)

    await database.execute("""
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

    await database.execute(f"""
        CREATE TABLE IF NOT EXISTS voice_settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            stt_provider TEXT NOT NULL DEFAULT 'webspeech',
            tts_provider TEXT NOT NULL DEFAULT 'webspeech',
            stt_api_key_enc {_BLOB},
            tts_api_key_enc {_BLOB},
            language TEXT NOT NULL DEFAULT 'fr-FR',
            tts_voice TEXT NOT NULL DEFAULT 'alloy',
            updated_at TEXT
        )
    """)

    await database.execute("""
        INSERT INTO voice_settings (id, stt_provider, tts_provider, language, tts_voice)
        VALUES (1, 'webspeech', 'webspeech', 'fr-FR', 'alloy')
        ON CONFLICT (id) DO NOTHING
    """)

    await database.execute("""
        CREATE TABLE IF NOT EXISTS proactive_config (
            id INTEGER PRIMARY KEY DEFAULT 1,
            enabled INTEGER NOT NULL DEFAULT 0,
            interval_minutes INTEGER NOT NULL DEFAULT 30,
            reminder_hours INTEGER NOT NULL DEFAULT 0,
            events_config TEXT NOT NULL DEFAULT '{}',
            channels_config TEXT NOT NULL DEFAULT '{}'
        )
    """)

    _default_events = '{"forge":{"overdue_tasks":true,"overdue_sprints":false},"oria":{"unread_messages":true},"mempalace":{"stale_entries":false}}'
    _default_channels = '{"inapp":true,"telegram":{"enabled":false,"bot_token":"","chat_id":""},"discord":{"enabled":false,"webhook_url":""}}'
    await database.execute(
        """
        INSERT INTO proactive_config (id, enabled, interval_minutes, reminder_hours, events_config, channels_config)
        VALUES (1, 0, 30, 0, :events, :channels)
        ON CONFLICT (id) DO NOTHING
        """,
        {"events": _default_events, "channels": _default_channels},
    )

    await database.execute("""
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


async def get_connections() -> list[dict]:
    rows = await database.fetch_all("SELECT * FROM connections ORDER BY created_at")
    return [dict(row) for row in rows]


async def upsert_connection(id: str, name: str, url: str, token: str, app_type: str, enabled: bool) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    await database.execute(
        """
        INSERT INTO connections (id, name, url, token, app_type, enabled, created_at)
        VALUES (:id, :name, :url, :token, :app_type, :enabled, :now)
        ON CONFLICT (id) DO UPDATE SET
            name = excluded.name,
            url = excluded.url,
            token = excluded.token,
            app_type = excluded.app_type,
            enabled = excluded.enabled
        """,
        {"id": id, "name": name, "url": url, "token": token, "app_type": app_type, "enabled": int(enabled), "now": now},
    )
    return {"id": id, "name": name, "url": url, "token": token, "app_type": app_type, "enabled": enabled, "created_at": now}


async def delete_connection(id: str):
    await database.execute("DELETE FROM connections WHERE id = :id", {"id": id})


async def get_voice_settings() -> dict:
    row = await database.fetch_one("SELECT * FROM voice_settings WHERE id = 1")
    return dict(row) if row else {}


async def upsert_voice_settings(
    stt_provider: str,
    tts_provider: str,
    stt_api_key_enc: bytes | None,
    tts_api_key_enc: bytes | None,
    language: str,
    tts_voice: str,
):
    now = datetime.now(timezone.utc).isoformat()
    await database.execute(
        """
        UPDATE voice_settings SET
            stt_provider = :stt_provider,
            tts_provider = :tts_provider,
            stt_api_key_enc = :stt_api_key_enc,
            tts_api_key_enc = :tts_api_key_enc,
            language = :language,
            tts_voice = :tts_voice,
            updated_at = :now
        WHERE id = 1
        """,
        {
            "stt_provider": stt_provider, "tts_provider": tts_provider,
            "stt_api_key_enc": stt_api_key_enc, "tts_api_key_enc": tts_api_key_enc,
            "language": language, "tts_voice": tts_voice, "now": now,
        },
    )


async def get_proactive_config() -> dict:
    row = await database.fetch_one("SELECT * FROM proactive_config WHERE id = 1")
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
    await database.execute(
        """
        UPDATE proactive_config SET
            enabled = :enabled,
            interval_minutes = :interval_minutes,
            reminder_hours = :reminder_hours,
            events_config = :events_config,
            channels_config = :channels_config
        WHERE id = 1
        """,
        {
            "enabled": int(enabled),
            "interval_minutes": interval_minutes,
            "reminder_hours": reminder_hours,
            "events_config": json.dumps(events_config),
            "channels_config": json.dumps(channels_config),
        },
    )


async def add_alert(source: str, event_type: str, title: str, body: str, channels_sent: list) -> str:
    alert_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await database.execute(
        """
        INSERT INTO proactive_alerts (id, source, event_type, title, body, read, channels_sent, created_at)
        VALUES (:id, :source, :event_type, :title, :body, 0, :channels_sent, :now)
        """,
        {
            "id": alert_id, "source": source, "event_type": event_type,
            "title": title, "body": body,
            "channels_sent": json.dumps(channels_sent), "now": now,
        },
    )
    return alert_id


async def get_alerts(unread_only: bool = False, limit: int = 100) -> list[dict]:
    q = "SELECT * FROM proactive_alerts"
    if unread_only:
        q += " WHERE read = 0"
    q += " ORDER BY created_at DESC LIMIT :limit"
    rows = await database.fetch_all(q, {"limit": limit})
    result = []
    for row in rows:
        d = dict(row)
        d["channels_sent"] = json.loads(d["channels_sent"])
        d["read"] = bool(d["read"])
        result.append(d)
    return result


async def mark_alert_read(alert_id: str):
    await database.execute(
        "UPDATE proactive_alerts SET read = 1 WHERE id = :id", {"id": alert_id}
    )


async def count_unread_alerts() -> int:
    row = await database.fetch_one("SELECT COUNT(*) as cnt FROM proactive_alerts WHERE read = 0")
    return row["cnt"] if row else 0
