"""Per-user encrypted token vault + OAuth2 PKCE callback."""

from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from models.schemas import OAuthCallbackBody, VaultStoreBody
from vault import list_vault, upsert_vault_token, delete_vault_token

router = APIRouter(tags=["vault"])


@router.get("/vault/tokens")
async def vault_list(user: dict = Depends(get_current_user)):
    return await list_vault(user["sub"])


@router.post("/vault/tokens/{app_type}")
async def vault_store(
    app_type: str,
    body: VaultStoreBody,
    user: dict = Depends(get_current_user),
):
    await upsert_vault_token(
        user_sub=user["sub"],
        app_type=app_type,
        access_token=body.access_token,
        refresh_token=body.refresh_token,
        expires_at=body.expires_at,
    )
    return {"stored": True, "app_type": app_type}


@router.delete("/vault/tokens/{app_type}")
async def vault_delete(app_type: str, user: dict = Depends(get_current_user)):
    await delete_vault_token(user["sub"], app_type)
    return {"deleted": app_type}


@router.post("/vault/oauth-callback/{app_type}")
async def vault_oauth_callback(
    app_type: str,
    body: OAuthCallbackBody,
    user: dict = Depends(get_current_user),
):
    """Exchange OAuth2 authorization code for tokens and store in vault."""
    token_url = (
        f"{body.keycloak_url}/realms/{body.realm}/protocol/openid-connect/token"
    )
    async with httpx.AsyncClient() as client:
        r = await client.post(
            token_url,
            data={
                "grant_type": "authorization_code",
                "code": body.code,
                "redirect_uri": body.redirect_uri,
                "client_id": body.client_id,
                "code_verifier": body.code_verifier,
            },
        )
    if not r.is_success:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {r.text}")
    data = r.json()
    expires_at = None
    if "expires_in" in data:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=data["expires_in"])
        ).isoformat()
    await upsert_vault_token(
        user_sub=user["sub"],
        app_type=app_type,
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token"),
        expires_at=expires_at,
    )
    return {"connected": True, "app_type": app_type}
