"""Assistant Backend — FastAPI app entry point.

Le découpage est dans :
- ``routers/`` : un fichier par domaine HTTP (chat, voice, admin, …)
- ``services/`` : logique pure réutilisable (gateway, mempalace, voice, …)
- ``models/`` : Pydantic schemas (``models/schemas.py``)

Cf. Sprint 96 — l'ancien main.py monolithique faisait 1294 LOC.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from agent import init_kiwix
from config import settings
from db import database, init_db
from notifiers import inapp as inapp_notifier
from redis_client import close_redis, init_redis
from services.degraded_metrics import sync_degraded_metrics
import proactive as proactive_mod
import scheduled as scheduled_mod
import swarm as swarm_mod

# Routers
from routers.admin_router import router as admin_router
from routers.chat import router as chat_router
from routers.connections import router as connections_router
from routers.conversations import router as conversations_router
from routers.gateway import router as gateway_router
from routers.health import router as health_router
from routers.mempalace_router import router as mempalace_router
from routers.persona_router import router as persona_router
from routers.proactive_router import router as proactive_router
from routers.push_router import router as push_router
from routers.scheduled_router import router as scheduled_router
from routers.summarizer_router import router as summarizer_router
from routers.swarm_router import router as swarm_router
from routers.uploads import router as uploads_router
from routers.vault_router import router as vault_router
from routers.voice_router import router as voice_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_kiwix()
    await init_redis()
    await inapp_notifier.start()
    await swarm_mod.start_redis_listener()
    proactive_mod.start_scheduler()
    scheduled_mod.start_scheduler()
    asyncio.create_task(sync_degraded_metrics())
    yield
    scheduled_mod.stop_scheduler()
    proactive_mod.stop_scheduler()
    await inapp_notifier.stop()
    await close_redis()
    await database.disconnect()


app = FastAPI(title="Assistant Backend", version="2.0.0", lifespan=lifespan)

Instrumentator().instrument(app).expose(app, include_in_schema=False)

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (health_router, connections_router, vault_router, gateway_router,
          mempalace_router, conversations_router, swarm_router, voice_router,
          uploads_router, proactive_router, push_router, summarizer_router,
          admin_router, chat_router, persona_router, scheduled_router):
    app.include_router(r)
