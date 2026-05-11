import httpx
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)
_jwks_cache: dict | None = None


async def _fetch_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    url = f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/certs"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, timeout=10)
        r.raise_for_status()
    _jwks_cache = r.json()
    return _jwks_cache


async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> dict:
    if not settings.AUTH_ENABLED:
        return {"sub": "anonymous", "nom": "Anonymous"}
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        jwks = await _fetch_jwks()
        payload = jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
        return payload
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
