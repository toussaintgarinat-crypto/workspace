"""/health, /models, /auth/config — public + low-risk endpoints."""

from fastapi import APIRouter, Depends

from agent_personnel_shared.health import HealthBuilder

from auth import get_current_user
from config import settings
from db import database
from redis_client import redis_client
from services.gateway_service import gw_request

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    """Schema unifié S101 (HealthBuilder) — garde status/auth_enabled top-level pour Prometheus et legacy."""
    builder = HealthBuilder(
        "assistant",
        version="2.0.0",
        metadata={"auth_enabled": settings.AUTH_ENABLED},
    )
    await builder.check_pg(database, name="postgres")
    await builder.check_redis(redis_client, name="redis")
    payload = builder.build()
    payload["auth_enabled"] = settings.AUTH_ENABLED
    return payload


@router.get("/models")
async def list_models(_: dict = Depends(get_current_user)):
    try:
        data = await gw_request("GET", "/model/info")
        return [m["model_name"] for m in data.get("data", [])]
    except Exception:
        return []


@router.get("/auth/config")
async def auth_config():
    return {
        "auth_enabled": settings.AUTH_ENABLED,
        "keycloak_url": settings.KEYCLOAK_URL,
        "keycloak_realm": settings.KEYCLOAK_REALM,
        "keycloak_client_id": settings.KEYCLOAK_CLIENT_ID,
    }
