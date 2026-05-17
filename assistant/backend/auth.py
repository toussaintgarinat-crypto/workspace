import logging
import time

import httpx
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from config import settings

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)
_jwks_cache: dict | None = None
_jwks_cached_at: float = 0.0
_JWKS_TTL = 600  # seconds — refresh keys every 10 minutes to handle Keycloak key rotation


async def _fetch_jwks() -> dict:
    global _jwks_cache, _jwks_cached_at
    now = time.monotonic()
    if _jwks_cache and (now - _jwks_cached_at) < _JWKS_TTL:
        return _jwks_cache
    url = f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/certs"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, timeout=10)
        r.raise_for_status()
    _jwks_cache = r.json()
    _jwks_cached_at = time.monotonic()
    return _jwks_cache


async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> dict:
    if not settings.AUTH_ENABLED:
        return {"sub": "anonymous", "nom": "Anonymous"}
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        jwks = await _fetch_jwks()
        decode_opts = ({"audience": settings.KEYCLOAK_AUDIENCE}
                       if settings.KEYCLOAK_AUDIENCE else {"verify_aud": False})
        payload = jwt.decode(token, jwks, algorithms=["RS256"], options=decode_opts)
        return payload
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


async def require_admin(token: str | None = Depends(oauth2_scheme)) -> dict:
    if not settings.AUTH_ENABLED:
        logger.warning("Admin endpoint accessed without auth (AUTH_ENABLED=false)")
        return {"sub": "anonymous"}
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        jwks = await _fetch_jwks()
        decode_opts = ({"audience": settings.KEYCLOAK_AUDIENCE}
                       if settings.KEYCLOAK_AUDIENCE else {"verify_aud": False})
        payload = jwt.decode(token, jwks, algorithms=["RS256"], options=decode_opts)
        roles = payload.get("realm_access", {}).get("roles", [])
        if "admin" not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
        return payload
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
