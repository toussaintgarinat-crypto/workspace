"""Base SQLAlchemy 2.0 async + init DB."""

from __future__ import annotations

import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from config import settings

logger = logging.getLogger(__name__)


def _build_url() -> str:
    if settings.DATABASE_URL:
        return settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    return f"sqlite+aiosqlite:///{settings.DB_PATH}"


engine = create_async_engine(_build_url(), echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    from models.orm import Base as OrmBase  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(OrmBase.metadata.create_all)
    logger.info("ToolHub DB ready")
