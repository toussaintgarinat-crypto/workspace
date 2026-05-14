import asyncio
import json
import logging
import uuid as _uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Depends, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from config import settings
from db import (
    init_db, get_connections, upsert_connection, delete_connection,
    get_voice_settings, upsert_voice_settings,
)
from auth import get_current_user
from vault import encrypt, decrypt, list_vault, get_vault_token, upsert_vault_token, delete_vault_token
from agent import ReActAgent
from prompt_engineer import PromptEngineer
from tools.oria import OriaTools
from voice.stt import get_stt_provider
from voice.tts import get_tts_provider
import swarm as swarm_mod

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
    use_prompt_engineer: bool = False


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


# ── Gateway management ───────────────────────────────────────────────────────

class GatewayModelBody(BaseModel):
    model_name: str
    litellm_params: dict


class GatewayKeyBody(BaseModel):
    key_alias: str
    max_budget: float = 10
    budget_duration: str = "1mo"
    models: list[str] | str = "auto"


async def _gw(method: str, path: str, body: dict | None = None):
    headers = {"Authorization": f"Bearer {settings.GATEWAY_MASTER_KEY}"}
    async with httpx.AsyncClient(timeout=10) as client:
        url = f"{settings.GATEWAY_URL}{path}"
        if method == "GET":
            r = await client.get(url, headers=headers)
        else:
            r = await client.post(url, json=body, headers=headers)
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


@app.get("/gateway/models")
async def gateway_list_models():
    return await _gw("GET", "/model/info")


@app.post("/gateway/models")
async def gateway_add_model(body: GatewayModelBody):
    return await _gw("POST", "/model/new", body.model_dump())


@app.delete("/gateway/models/{model_id}")
async def gateway_delete_model(model_id: str):
    return await _gw("POST", "/model/delete", {"id": model_id})


@app.get("/gateway/keys")
async def gateway_list_keys():
    return await _gw("GET", "/key/list")


@app.post("/gateway/keys")
async def gateway_add_key(body: GatewayKeyBody):
    return await _gw("POST", "/key/generate", body.model_dump())


@app.delete("/gateway/keys/{key}")
async def gateway_delete_key(key: str):
    return await _gw("POST", "/key/delete", {"keys": [key]})


# ── MemPalace proxy ──────────────────────────────────────────────────────────

class MempalaceSearchBody(BaseModel):
    query: str
    wing: str | None = None
    n_results: int = 10


async def _get_mempalace_creds(user: dict) -> tuple[str, str]:
    """Return (url, token) for MemPalace or raise 503."""
    if settings.AUTH_ENABLED:
        token = await get_vault_token(user["sub"], "mempalace")
        if not token:
            raise HTTPException(status_code=503, detail="MemPalace not connected")
        return _default_url("mempalace"), token
    else:
        connections = await get_connections()
        for c in connections:
            if c.get("app_type") == "mempalace" and c.get("enabled"):
                return c["url"], c["token"]
        raise HTTPException(status_code=503, detail="MemPalace not connected")


@app.get("/mempalace/wings")
async def mempalace_wings(user: dict = Depends(get_current_user)):
    url, token = await _get_mempalace_creds(user)
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{url}/api/wings",
                             headers={"Authorization": f"Bearer {token}"})
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


@app.post("/mempalace/search")
async def mempalace_search(body: MempalaceSearchBody, user: dict = Depends(get_current_user)):
    url, token = await _get_mempalace_creds(user)
    payload = {"query": body.query, "n_results": body.n_results}
    if body.wing:
        payload["wing"] = body.wing
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{url}/api/search",
                              json=payload,
                              headers={"Authorization": f"Bearer {token}"})
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


@app.get("/mempalace/entries/{wing}")
async def mempalace_entries(wing: str, limit: int = 50, user: dict = Depends(get_current_user)):
    url, token = await _get_mempalace_creds(user)
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{url}/api/wings/{wing}/drawers",
                             params={"limit": limit},
                             headers={"Authorization": f"Bearer {token}"})
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


# ── Swarm ────────────────────────────────────────────────────────────────────

class SwarmTaskBody(BaseModel):
    title: str
    role: str
    instructions: str
    id: str | None = None


@app.get("/swarm/tasks")
async def swarm_list():
    return await swarm_mod.list_swarm_tasks()


@app.post("/swarm/tasks")
async def swarm_create(body: SwarmTaskBody):
    task_id = body.id or str(_uuid.uuid4())
    return await swarm_mod.create_swarm_task(task_id, body.title, body.role, body.instructions)


@app.patch("/swarm/tasks/{task_id}/done")
async def swarm_done(task_id: str):
    return await swarm_mod.mark_task_done(task_id)


@app.delete("/swarm/tasks/{task_id}")
async def swarm_cancel(task_id: str):
    await swarm_mod.cancel_swarm_task(task_id)
    return {"cancelled": task_id}


@app.get("/swarm/events")
async def swarm_events():
    q = swarm_mod.subscribe()

    async def generator():
        tasks = await swarm_mod.list_swarm_tasks()
        yield json.dumps({"type": "init", "tasks": tasks}, ensure_ascii=False)
        try:
            while True:
                try:
                    item = await asyncio.wait_for(q.get(), timeout=25)
                    yield json.dumps(item, ensure_ascii=False)
                except asyncio.TimeoutError:
                    yield json.dumps({"type": "ping"}, ensure_ascii=False)
        except asyncio.CancelledError:
            pass
        finally:
            swarm_mod.unsubscribe(q)

    return EventSourceResponse(generator())


# ── Oria trace ────────────────────────────────────────────────────────────────

async def _post_oria_trace(
    active: list[dict],
    raw_prompt: str,
    refined_data: dict | None,
    tools_used: list[str],
    result_content: str,
):
    oria_conn = next(
        (c for c in active if c.get("app_type") == "oria" and c.get("enabled")), None
    )
    if not oria_conn:
        return
    oria = OriaTools(oria_conn["url"], oria_conn["token"])
    try:
        rooms = await oria.list_rooms()
        traces_room = next(
            (r for r in rooms if r.get("name") == "assistant-traces"), None
        )
        if not traces_room:
            return
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines = [f"**📋 Trace assistant** — {ts}"]
        lines.append(f"**Prompt brut :** {raw_prompt[:300]}{'…' if len(raw_prompt) > 300 else ''}")
        if refined_data:
            rp = refined_data.get("refined_prompt", "")
            lines.append(f"**Prompt affiné :** {rp[:300]}{'…' if len(rp) > 300 else ''}")
            lines.append(f"**Intent :** {refined_data.get('interpreted_intent', '')}")
            lines.append(f"**Confiance :** {refined_data.get('confidence', 'N/A')}")
            flags = refined_data.get("uncertainty_flags", [])
            if flags:
                lines.append(f"**Incertitudes :** {', '.join(flags)}")
        if tools_used:
            lines.append(f"**Outils :** {', '.join(tools_used)}")
        if result_content:
            snippet = result_content[:400]
            lines.append(f"**Réponse :** {snippet}{'…' if len(result_content) > 400 else ''}")
        await oria.post_message(traces_room["id"], "\n".join(lines))
    except Exception as e:
        logger.warning("Failed to post trace to Oria: %s", e)


# ── Voice ────────────────────────────────────────────────────────────────────

class VoiceSettingsBody(BaseModel):
    stt_provider: str = "webspeech"
    tts_provider: str = "webspeech"
    stt_api_key: str | None = None
    tts_api_key: str | None = None
    language: str = "fr-FR"
    tts_voice: str = "alloy"


@app.get("/voice/settings")
async def voice_get_settings():
    vs = await get_voice_settings()
    return {
        "stt_provider": vs.get("stt_provider", "webspeech"),
        "tts_provider": vs.get("tts_provider", "webspeech"),
        "stt_api_key_set": bool(vs.get("stt_api_key_enc")),
        "tts_api_key_set": bool(vs.get("tts_api_key_enc")),
        "language": vs.get("language", "fr-FR"),
        "tts_voice": vs.get("tts_voice", "alloy"),
    }


@app.post("/voice/settings")
async def voice_save_settings(body: VoiceSettingsBody):
    current = await get_voice_settings()

    stt_enc = current.get("stt_api_key_enc")
    if body.stt_api_key is not None:
        stt_enc = encrypt(body.stt_api_key) if body.stt_api_key else None

    tts_enc = current.get("tts_api_key_enc")
    if body.tts_api_key is not None:
        tts_enc = encrypt(body.tts_api_key) if body.tts_api_key else None

    await upsert_voice_settings(
        stt_provider=body.stt_provider,
        tts_provider=body.tts_provider,
        stt_api_key_enc=stt_enc,
        tts_api_key_enc=tts_enc,
        language=body.language,
        tts_voice=body.tts_voice,
    )
    return {"saved": True}


@app.post("/voice/transcribe")
async def voice_transcribe(
    audio: UploadFile = File(...),
    language: str = Form(default="fr-FR"),
):
    vs = await get_voice_settings()
    provider = vs.get("stt_provider", "webspeech")

    if provider != "openai_whisper":
        raise HTTPException(status_code=400, detail="WebSpeech STT is handled client-side")

    key_enc = vs.get("stt_api_key_enc")
    if not key_enc:
        raise HTTPException(status_code=400, detail="OpenAI API key not configured for STT")

    api_key = decrypt(key_enc)
    stt = get_stt_provider("openai_whisper", api_key)
    audio_data = await audio.read()
    text = await stt.transcribe(audio_data, audio.content_type or "audio/webm", language)
    return {"text": text}


class SynthesizeBody(BaseModel):
    text: str
    voice: str | None = None


@app.post("/voice/synthesize")
async def voice_synthesize(body: SynthesizeBody):
    if not body.text:
        raise HTTPException(status_code=400, detail="No text provided")

    vs = await get_voice_settings()
    provider = vs.get("tts_provider", "webspeech")

    if provider != "openai_tts":
        raise HTTPException(status_code=400, detail="WebSpeech TTS is handled client-side")

    key_enc = vs.get("tts_api_key_enc")
    if not key_enc:
        raise HTTPException(status_code=400, detail="OpenAI API key not configured for TTS")

    api_key = decrypt(key_enc)
    tts = get_tts_provider("openai_tts", api_key)
    voice = body.voice or vs.get("tts_voice", "alloy")
    audio_bytes, content_type = await tts.synthesize(body.text, voice, vs.get("language", "fr-FR"))
    return Response(content=audio_bytes, media_type=content_type)


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

    # ── Prompt refinement ────────────────────────────────────────────────────
    raw_prompt = ""
    refined_data: dict | None = None
    effective_messages = list(body.messages)

    if body.use_prompt_engineer and body.messages:
        last = body.messages[-1]
        if last.get("role") == "user":
            raw_prompt = last.get("content", "")
            refined_data = await PromptEngineer().refine(raw_prompt)
            if refined_data and refined_data.get("refined_prompt"):
                effective_messages = list(body.messages[:-1]) + [
                    {"role": "user", "content": refined_data["refined_prompt"]}
                ]

    agent = ReActAgent(active)

    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        tools_used: list[str] = []
        result_parts: list[str] = []

        async def on_chunk(chunk: dict):
            if chunk.get("type") == "tool_start":
                tools_used.append(chunk["name"])
            elif chunk.get("type") == "text":
                result_parts.append(chunk.get("content", ""))
            await queue.put(chunk)

        async def run_agent():
            try:
                await agent.stream_chat(effective_messages, on_chunk)
            except Exception as e:
                logger.error("Agent error: %s", e)
                await queue.put({"type": "error", "content": str(e)})
            finally:
                await queue.put(None)

        task = asyncio.create_task(run_agent())

        if refined_data:
            yield json.dumps({"type": "prompt_refined", "data": refined_data}, ensure_ascii=False)

        while True:
            item = await queue.get()
            if item is None:
                if body.use_prompt_engineer and raw_prompt:
                    asyncio.create_task(_post_oria_trace(
                        active, raw_prompt, refined_data, tools_used, "".join(result_parts)
                    ))
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
