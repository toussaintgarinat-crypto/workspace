import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from config import settings
from db import init_db, get_connections, upsert_connection, delete_connection
from auth import get_current_user
from vault import list_vault, get_vault_token, upsert_vault_token, delete_vault_token
from agent import ReActAgent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Assistant Backend", version="2.0.0", lifespan=lifespan)

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ───────────────────────────────────────────────────────────────────

class ConnectionBody(BaseModel):
    id: str
    name: str
    url: str
    token: str
    app_type: str
    enabled: bool = True


class ChatBody(BaseModel):
    messages: list[dict]


class VaultTokenBody(BaseModel):
    access_token: str
    refresh_token: str | None = None
    expires_at: str | None = None
    url: str | None = None


class OAuthCallbackBody(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str
    keycloak_url: str
    realm: str
    client_id: str


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "auth_enabled": settings.AUTH_ENABLED}


# ── Global connections (legacy / AUTH_ENABLED=false) ─────────────────────────

@app.get("/connections")
async def list_connections():
    return await get_connections()


@app.post("/connections")
async def create_connection(body: ConnectionBody):
    return await upsert_connection(
        id=body.id,
        name=body.name,
        url=body.url,
        token=body.token,
        app_type=body.app_type,
        enabled=body.enabled,
    )


@app.delete("/connections/{connection_id}")
async def remove_connection(connection_id: str):
    await delete_connection(connection_id)
    return {"deleted": connection_id}


# ── Token vault (per-user, encrypted) ────────────────────────────────────────

@app.get("/vault/tokens")
async def vault_list(user: dict = Depends(get_current_user)):
    return await list_vault(user["sub"])


class VaultStoreBody(BaseModel):
    access_token: str
    refresh_token: str | None = None
    expires_at: str | None = None


@app.post("/vault/tokens/{app_type}")
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


@app.delete("/vault/tokens/{app_type}")
async def vault_delete(app_type: str, user: dict = Depends(get_current_user)):
    await delete_vault_token(user["sub"], app_type)
    return {"deleted": app_type}


@app.post("/vault/oauth-callback/{app_type}")
async def vault_oauth_callback(
    app_type: str,
    body: OAuthCallbackBody,
    user: dict = Depends(get_current_user),
):
    """Exchange OAuth2 authorization code for tokens and store in vault."""
    token_url = f"{body.keycloak_url}/realms/{body.realm}/protocol/openid-connect/token"
    async with httpx.AsyncClient() as client:
        r = await client.post(token_url, data={
            "grant_type": "authorization_code",
            "code": body.code,
            "redirect_uri": body.redirect_uri,
            "client_id": body.client_id,
            "code_verifier": body.code_verifier,
        })
    if not r.is_success:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {r.text}")
    data = r.json()
    expires_at = None
    if "expires_in" in data:
        from datetime import timedelta
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


# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(body: ChatBody, user: dict = Depends(get_current_user)):
    if settings.AUTH_ENABLED:
        vault = await list_vault(user["sub"])
        active = []
        for entry in vault:
            token = await get_vault_token(user["sub"], entry["app_type"])
            if token:
                active.append({
                    "id": entry["app_type"],
                    "name": entry["app_type"].capitalize(),
                    "app_type": entry["app_type"],
                    "token": token,
                    "url": _default_url(entry["app_type"]),
                    "enabled": True,
                })
    else:
        connections = await get_connections()
        active = [c for c in connections if c.get("enabled")]

    agent = ReActAgent(active)

    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()

        async def on_chunk(chunk: dict):
            await queue.put(chunk)

        async def run_agent():
            try:
                await agent.stream_chat(body.messages, on_chunk)
            except Exception as e:
                logger.error("Agent error: %s", e)
                await queue.put({"type": "error", "content": str(e)})
            finally:
                await queue.put(None)

        task = asyncio.create_task(run_agent())

        while True:
            item = await queue.get()
            if item is None:
                yield json.dumps({"type": "done"}, ensure_ascii=False)
                break
            yield json.dumps(item, ensure_ascii=False)

        await task

    return EventSourceResponse(event_generator())


def _default_url(app_type: str) -> str:
    defaults = {
        "forge":     "http://localhost:8000",
        "oria":      "http://localhost:8000",
        "mempalace": "http://localhost:8100",
    }
    return defaults.get(app_type, "http://localhost:8000")
