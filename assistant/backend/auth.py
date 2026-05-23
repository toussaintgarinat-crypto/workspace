import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError

from agent_personnel_shared.keycloak_auth import (
    KeycloakSettings,
    has_role,
    verify_token,
)
from config import settings

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

# Configuration Keycloak partagée (audience conditionnelle pour multi-tenant).
_KC = KeycloakSettings(
    url=settings.KEYCLOAK_URL,
    realm=settings.KEYCLOAK_REALM,
    audience=settings.KEYCLOAK_AUDIENCE,
    jwks_ttl=600,
)


async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> dict:
    if not settings.AUTH_ENABLED:
        return {"sub": "anonymous", "nom": "Anonymous"}
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return await verify_token(token, _KC)
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


async def require_admin(token: str | None = Depends(oauth2_scheme)) -> dict:
    if not settings.AUTH_ENABLED:
        logger.warning("Admin endpoint accessed without auth (AUTH_ENABLED=false)")
        return {"sub": "anonymous"}
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = await verify_token(token, _KC)
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    if not has_role(payload, "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return payload
