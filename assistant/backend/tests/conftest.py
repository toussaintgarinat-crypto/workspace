"""Pytest fixtures partagées — Assistant unit tests (S102).

Principes :
- PAS de mock DB. On utilise une vraie SQLite sur disque temporaire pour les
  tests qui touchent la couche données (cf. feedback_approche : un mock DB
  passé avait déjà masqué un bug de migration prod).
- Mock HTTP : on s'appuie sur respx pour intercepter httpx sans monkey-patching.
- Les variables d'environnement sont positionnées AVANT l'import de
  ``config`` / ``db`` parce que ``databases.Database(url)`` est instancié au
  niveau module.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

# ── Bootstrap env BEFORE any project import ──────────────────────────────
_TMP = Path(tempfile.mkdtemp(prefix="assistant_test_"))
_DB_FILE = _TMP / "assistant.db"

os.environ.setdefault("DB_PATH", str(_DB_FILE))
os.environ.setdefault("DATABASE_URL", "")  # force SQLite
os.environ.setdefault("VAULT_SECRET", "x" * 32)
os.environ.setdefault("GATEWAY_URL", "http://gateway.test:4000")
os.environ.setdefault("GATEWAY_API_KEY", "sk-test")
os.environ.setdefault("GATEWAY_MASTER_KEY", "sk-master-test")
os.environ.setdefault("AUTH_ENABLED", "False")
os.environ.setdefault("LOCAL_VOICE_ENABLED", "False")
os.environ.setdefault("REDIS_URL", "")

# Rend les imports `from config import settings` (etc.) disponibles
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def fake_user() -> dict:
    return {"sub": "test-user", "email": "test@example.com"}


@pytest.fixture
def mempalace_conn() -> dict:
    return {
        "id": "mp-1",
        "name": "MemPalace",
        "url": "http://mempalace.test:8100",
        "token": "mp-token",
        "app_type": "mempalace",
        "enabled": True,
    }


@pytest.fixture
def oria_conn() -> dict:
    return {
        "id": "oria-1",
        "name": "Oria",
        "url": "http://oria.test:8000",
        "token": "oria-token",
        "app_type": "oria",
        "enabled": True,
    }


# ── DB fixture : vraie SQLite, isolée par test ──────────────────────────
@pytest.fixture
async def real_db():
    """Connecte la vraie DB (SQLite) du module, crée les tables, isole les rows.

    Yield la référence à ``database`` (instance ``databases.Database``).
    Utiliser pour tester ``connections_service`` ou tout service qui parle DB.
    """
    from db import database, init_db

    # init_db importe persona+scheduled (qui à leur tour importent gateway/...)
    # On évite ça en créant nous-mêmes les tables minimales requises.
    await database.connect()
    await database.execute(
        """
        CREATE TABLE IF NOT EXISTS connections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            token TEXT NOT NULL,
            app_type TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
        """
    )
    await database.execute(
        """
        CREATE TABLE IF NOT EXISTS user_tokens (
            user_sub TEXT NOT NULL,
            app_type TEXT NOT NULL,
            access_token_enc BLOB,
            refresh_token_enc BLOB,
            expires_at TEXT,
            PRIMARY KEY (user_sub, app_type)
        )
        """
    )
    # Vide à chaque test pour isolation
    await database.execute("DELETE FROM connections")
    await database.execute("DELETE FROM user_tokens")
    try:
        yield database
    finally:
        await database.execute("DELETE FROM connections")
        await database.execute("DELETE FROM user_tokens")
        await database.disconnect()
