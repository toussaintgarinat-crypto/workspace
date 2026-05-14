import aiosqlite
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
