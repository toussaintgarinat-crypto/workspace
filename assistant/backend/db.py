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
