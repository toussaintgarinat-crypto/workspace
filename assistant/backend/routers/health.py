"""/health, /models, /auth/config — public + low-risk endpoints."""

from fastapi import APIRouter, Depends

from auth import get_current_user
from config import settings
from services.gateway_service import gw_request

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "auth_enabled": settings.AUTH_ENABLED}


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
