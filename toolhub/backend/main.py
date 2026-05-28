"""ToolHub — point d'entrée FastAPI (port 8500)."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from config import settings
from db import AsyncSessionLocal, init_db
from registry.loader import init_registry, list_handlers
from routers.categories import router as categories_router
from routers.credentials import router as credentials_router
from routers.execute import router as execute_router
from routers.health import router as health_router
from routers.mcp import router as mcp_router
from routers.tools import router as tools_router

logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        from agent_personnel_shared.redis_client import init_redis
        if settings.REDIS_URL:
            await init_redis(settings.REDIS_URL)
    except Exception as exc:
        logger.warning("Redis init failed (optional): %s", exc)

    async with AsyncSessionLocal() as session:
        await init_registry(session)

    logger.info("ToolHub started on port 8500 — %d handlers ready", len(list_handlers()))
    yield

    try:
        from agent_personnel_shared.redis_client import close_redis
        await close_redis()
    except Exception:
        pass
    logger.info("ToolHub shutdown complete")


app = FastAPI(title="ToolHub", version="1.0.0", lifespan=lifespan)

try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app, include_in_schema=False)
except ImportError:
    pass

# CORS
try:
    from agent_personnel_shared.fastapi_setup import setup_cors
    setup_cors(app, settings.CORS_ORIGINS, default=["http://localhost:3000"])
except Exception:
    from fastapi.middleware.cors import CORSMiddleware
    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins or ["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

_ROUTERS = (health_router, categories_router, tools_router, credentials_router, execute_router, mcp_router)
for r in _ROUTERS:
    app.include_router(r, prefix="/v1")
    app.include_router(r)
