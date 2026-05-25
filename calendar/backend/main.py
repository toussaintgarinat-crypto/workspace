"""Calendar Service — point d'entrée FastAPI."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from agent_personnel_shared.fastapi_setup import setup_cors, setup_logging
from config import settings
from db import init_db
from routers.health import router as health_router

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Calendar service started on port 8400")
    yield
    logger.info("Calendar service shutting down")


app = FastAPI(title="Calendar Service", version="1.0.0", lifespan=lifespan)

Instrumentator().instrument(app).expose(app, include_in_schema=False)

setup_cors(app, settings.CORS_ORIGINS, default=["http://localhost:8300"])

app.include_router(health_router)
