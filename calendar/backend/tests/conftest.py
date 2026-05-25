"""Fixtures pytest — Calendar Service (S106b).

- env vars positionnés AVANT tout import projet
- SQLite aiosqlite en mémoire par test
- AUTH_ENABLED=false → user = "anonymous"
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest
import pytest_asyncio

# ── Bootstrap env AVANT tout import projet ───────────────────────────────────
_TMP = Path(tempfile.mkdtemp(prefix="calendar_test_"))

os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("DB_PATH", str(_TMP / "calendar_test.db"))
os.environ.setdefault("REDIS_URL", "")
os.environ.setdefault("AUTH_ENABLED", "False")
os.environ.setdefault("CALENDAR_SERVICE_TOKEN", "")
os.environ.setdefault("ATTACHMENTS_DIR", str(_TMP / "attachments"))
os.environ.setdefault("KEYCLOAK_URL", "http://localhost:8080")
os.environ.setdefault("KEYCLOAK_REALM", "forge")
os.environ.setdefault("KEYCLOAK_AUDIENCE", "")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

_SHARED = _BACKEND.parent.parent / "shared"
if str(_SHARED) not in sys.path:
    sys.path.insert(0, str(_SHARED))


@pytest_asyncio.fixture
async def client():
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    TestSession = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    from models.orm import Base

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from db import get_db
    from main import app

    async def _override_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = _override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()
