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

from prometheus_fastapi_instrumentator import Instrumentator

from config import settings
from db import (
    database, init_db, get_connections, upsert_connection, delete_connection,
    get_voice_settings, upsert_voice_settings,
    get_proactive_config, upsert_proactive_config,
    get_alerts, mark_alert_read, count_unread_alerts,
    upsert_conversation, list_conversations, delete_conversation_db, search_conversations,
)
from auth import get_current_user, require_admin
from vault import encrypt, decrypt, list_vault, get_vault_token, upsert_vault_token, delete_vault_token
from agent import ReActAgent
from prompt_engineer import PromptEngineer
from tools.oria import OriaTools
from voice.stt import get_stt_provider
from voice.tts import get_tts_provider
import swarm as swarm_mod
import proactive as proactive_mod
import push as push_mod
import rag as rag_mod
import summarizer as summarizer_mod
from notifiers import inapp as inapp_notifier

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    from redis_client import init_redis, close_redis
    await init_redis()
    await inapp_notifier.start()
    await swarm_mod.start_redis_listener()
    proactive_mod.start_scheduler()
    yield
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
    rag_enabled: bool = True
    model: str | None = None


class ConfirmUploadBody(BaseModel):
    file_id: str | None = None
    filename: str
    wing: str
    room: str
    summary: str


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


# ── Health / Auth config ──────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "auth_enabled": settings.AUTH_ENABLED}


@app.get("/models")
async def list_models(_: dict = Depends(get_current_user)):
    try:
        data = await _gw("GET", "/model/info")
        return [m["model_name"] for m in data.get("data", [])]
    except Exception:
        return []


@app.get("/auth/config")
async def auth_config():
    return {
        "auth_enabled": settings.AUTH_ENABLED,
        "keycloak_url": settings.KEYCLOAK_URL,
        "keycloak_realm": settings.KEYCLOAK_REALM,
        "keycloak_client_id": settings.KEYCLOAK_CLIENT_ID,
    }


# ── Global connections (legacy / AUTH_ENABLED=false) ─────────────────────────

@app.get("/connections")
async def list_connections(_: dict = Depends(get_current_user)):
    return await get_connections()


@app.post("/connections")
async def create_connection(body: ConnectionBody, _: dict = Depends(get_current_user)):
    return await upsert_connection(
        id=body.id,
        name=body.name,
        url=body.url,
        token=body.token,
        app_type=body.app_type,
        enabled=body.enabled,
    )


@app.delete("/connections/{connection_id}")
async def remove_connection(connection_id: str, _: dict = Depends(get_current_user)):
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
    if not settings.GATEWAY_MASTER_KEY:
        raise HTTPException(status_code=503, detail="GATEWAY_MASTER_KEY not configured")
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
async def gateway_list_models(_: dict = Depends(require_admin)):
    return await _gw("GET", "/model/info")


@app.post("/gateway/models")
async def gateway_add_model(body: GatewayModelBody, _: dict = Depends(require_admin)):
    return await _gw("POST", "/model/new", body.model_dump())


@app.delete("/gateway/models/{model_id}")
async def gateway_delete_model(model_id: str, _: dict = Depends(require_admin)):
    return await _gw("POST", "/model/delete", {"id": model_id})


@app.get("/gateway/keys")
async def gateway_list_keys(_: dict = Depends(require_admin)):
    return await _gw("GET", "/key/list")


@app.post("/gateway/keys")
async def gateway_add_key(body: GatewayKeyBody, _: dict = Depends(require_admin)):
    return await _gw("POST", "/key/generate", body.model_dump())


@app.delete("/gateway/keys/{key}")
async def gateway_delete_key(key: str, _: dict = Depends(require_admin)):
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


class MempalaceDrawerBody(BaseModel):
    content: str
    wing: str = "Input"
    room: str = "conversations"
    metadata: dict | None = None


@app.post("/mempalace/drawers", status_code=201)
async def mempalace_add_drawer(body: MempalaceDrawerBody, user: dict = Depends(get_current_user)):
    url, token = await _get_mempalace_creds(user)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{url}/api/drawers",
            json={"content": body.content, "wing": body.wing, "room": body.room,
                  "metadata": body.metadata or {}},
            headers={"Authorization": f"Bearer {token}"},
        )
    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


# ── Conversations (S59 — Cloud storage mode) ──────────────────────────────────

class ConversationSyncBody(BaseModel):
    id: str
    title: str
    messages: list[dict]
    created_at: str = ""


class ConversationSearchBody(BaseModel):
    query: str
    limit: int = 20


@app.post("/conversations/sync")
async def conversations_sync(body: ConversationSyncBody, user: dict = Depends(get_current_user)):
    user_sub = user.get("sub", "anonymous")
    return await upsert_conversation(body.id, user_sub, body.title, body.messages)


@app.get("/conversations")
async def conversations_list(user: dict = Depends(get_current_user)):
    user_sub = user.get("sub", "anonymous")
    return await list_conversations(user_sub)


@app.post("/conversations/search")
async def conversations_search(body: ConversationSearchBody, user: dict = Depends(get_current_user)):
    user_sub = user.get("sub", "anonymous")
    results = await search_conversations(body.query, user_sub, body.limit)
    return {"results": results}


@app.delete("/conversations/{conversation_id}")
async def conversations_delete(conversation_id: str, user: dict = Depends(get_current_user)):
    user_sub = user.get("sub", "anonymous")
    await delete_conversation_db(conversation_id, user_sub)
    return {"deleted": conversation_id}


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
    from metrics import sse_clients_active
    q = swarm_mod.subscribe()
    sse_clients_active.labels(stream="swarm").inc()

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
            sse_clients_active.labels(stream="swarm").dec()

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

    if provider == "webspeech":
        raise HTTPException(status_code=400, detail="WebSpeech STT is handled client-side")

    if provider == "faster_whisper":
        if not settings.LOCAL_VOICE_ENABLED:
            raise HTTPException(status_code=503, detail="Local voice not enabled — set LOCAL_VOICE_ENABLED=true")
        stt = get_stt_provider("faster_whisper")
    elif provider == "openai_whisper":
        key_enc = vs.get("stt_api_key_enc")
        if not key_enc:
            raise HTTPException(status_code=400, detail="OpenAI API key not configured for STT")
        stt = get_stt_provider("openai_whisper", decrypt(key_enc))
    else:
        raise HTTPException(status_code=400, detail=f"Unknown STT provider: {provider}")

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

    if provider == "webspeech":
        raise HTTPException(status_code=400, detail="WebSpeech TTS is handled client-side")

    if provider == "kokoro":
        if not settings.LOCAL_VOICE_ENABLED:
            raise HTTPException(status_code=503, detail="Local voice not enabled — set LOCAL_VOICE_ENABLED=true")
        tts = get_tts_provider("kokoro")
        voice = body.voice or vs.get("tts_voice", settings.KOKORO_VOICE)
    elif provider == "openai_tts":
        key_enc = vs.get("tts_api_key_enc")
        if not key_enc:
            raise HTTPException(status_code=400, detail="OpenAI API key not configured for TTS")
        tts = get_tts_provider("openai_tts", decrypt(key_enc))
        voice = body.voice or vs.get("tts_voice", "alloy")
    else:
        raise HTTPException(status_code=400, detail=f"Unknown TTS provider: {provider}")

    audio_bytes, content_type = await tts.synthesize(body.text, voice, vs.get("language", "fr-FR"))
    return Response(content=audio_bytes, media_type=content_type)


# ── Document Upload ────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    from doc_intelligence import extract_text, classify_document

    content = await file.read()
    filename = file.filename or "document"
    mime = file.content_type

    text = await extract_text(content, filename, mime)
    classification = await classify_document(text, filename)

    connections = await get_connections()
    mp_conn = next(
        (c for c in connections if c.get("app_type") == "mempalace" and c.get("enabled")),
        None,
    )
    file_id = None
    if mp_conn:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{mp_conn['url'].rstrip('/')}/api/documents",
                    files={"file": (filename, content, mime or "application/octet-stream")},
                    data={
                        "wing": classification.get("wing", "Ressource").lower(),
                        "room": classification.get("room", "documents"),
                    },
                    headers={"Authorization": f"Bearer {mp_conn['token']}"},
                )
                if resp.status_code in (200, 201):
                    file_id = resp.json().get("id")
        except Exception as e:
            logger.warning("MemPalace raw upload failed: %s", e)

    return {
        "file_id": file_id,
        "filename": filename,
        "size": len(content),
        "summary": classification.get("summary", ""),
        "proposed_wing": classification.get("wing", "Ressource"),
        "proposed_room": classification.get("room", "documents"),
        "confidence": classification.get("confidence", 0.5),
        "text_length": len(text),
    }


@app.post("/upload/confirm")
async def confirm_upload(body: ConfirmUploadBody, user: dict = Depends(get_current_user)):
    connections = await get_connections()
    mp_conn = next(
        (c for c in connections if c.get("app_type") == "mempalace" and c.get("enabled")),
        None,
    )
    if not mp_conn:
        return {"ok": False, "error": "MemPalace non connecté"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{mp_conn['url'].rstrip('/')}/api/drawers",
                json={
                    "content": body.summary,
                    "wing": body.wing.lower(),
                    "room": body.room.lower().replace(" ", "-"),
                    "metadata": {"source_file": body.filename, "file_id": body.file_id},
                },
                headers={"Authorization": f"Bearer {mp_conn['token']}"},
            )
            resp.raise_for_status()
        return {"ok": True}
    except Exception as e:
        logger.error("MemPalace confirm failed: %s", e)
        return {"ok": False, "error": str(e)}


# ── Proactive ────────────────────────────────────────────────────────────────

class ProactiveConfigBody(BaseModel):
    enabled: bool
    interval_minutes: int = 30
    reminder_hours: int = 0
    events_config: dict = {}
    channels_config: dict = {}


@app.get("/proactive/status")
async def proactive_status():
    status = proactive_mod.get_status()
    cfg = await get_proactive_config()
    status["enabled"] = cfg.get("enabled", False)
    status["unread_count"] = await count_unread_alerts()
    return status


@app.get("/proactive/config")
async def proactive_get_config():
    return await get_proactive_config()


@app.put("/proactive/config")
async def proactive_put_config(body: ProactiveConfigBody, _: dict = Depends(get_current_user)):
    await upsert_proactive_config(
        enabled=body.enabled,
        interval_minutes=body.interval_minutes,
        reminder_hours=body.reminder_hours,
        events_config=body.events_config,
        channels_config=body.channels_config,
    )
    return {"saved": True}


@app.post("/proactive/check")
async def proactive_manual_check(_: dict = Depends(get_current_user)):
    cfg = await get_proactive_config()
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Le mode proactif est désactivé")
    asyncio.create_task(proactive_mod.run_check())
    return {"started": True}


@app.get("/proactive/alerts")
async def proactive_list_alerts(unread_only: bool = False, limit: int = 100):
    return await get_alerts(unread_only=unread_only, limit=limit)


@app.post("/proactive/alerts/{alert_id}/read")
async def proactive_mark_read(alert_id: str):
    await mark_alert_read(alert_id)
    unread = await count_unread_alerts()
    await inapp_notifier.broadcast({"type": "badge_update", "unread_count": unread})
    return {"ok": True}


@app.get("/proactive/alerts/stream")
async def proactive_alerts_stream():
    from metrics import sse_clients_active
    q = inapp_notifier.subscribe()
    sse_clients_active.labels(stream="alerts").inc()

    async def generator():
        unread = await count_unread_alerts()
        yield json.dumps({"type": "init", "unread_count": unread}, ensure_ascii=False)
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
            inapp_notifier.unsubscribe(q)
            sse_clients_active.labels(stream="alerts").dec()

    return EventSourceResponse(generator())


# ── WebPush ──────────────────────────────────────────────────────────────────

class PushSubscribeBody(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushUnsubscribeBody(BaseModel):
    endpoint: str


@app.get("/push/vapid-public-key")
async def push_vapid_key():
    key = await push_mod.get_public_key()
    if not key:
        raise HTTPException(status_code=503, detail="WebPush not available")
    return {"public_key": key}


@app.post("/push/subscribe")
async def push_subscribe(body: PushSubscribeBody):
    await push_mod.save_subscription(body.endpoint, body.p256dh, body.auth)
    return {"subscribed": True}


@app.post("/push/unsubscribe")
async def push_unsubscribe(body: PushUnsubscribeBody):
    await push_mod.delete_subscription(body.endpoint)
    return {"unsubscribed": True}


# ── Conversation Summarizer ───────────────────────────────────────────────────

class SummarizeBody(BaseModel):
    messages: list[dict]
    session_id: str = ""


@app.post("/conversation/summarize")
async def summarize_endpoint(body: SummarizeBody, user: dict = Depends(get_current_user)):
    if not settings.SUMMARIZE_ENABLED:
        raise HTTPException(status_code=400, detail="Summarizer disabled")
    if not body.messages:
        raise HTTPException(status_code=400, detail="No messages provided")

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

    from openai import AsyncOpenAI
    llm_client = AsyncOpenAI(
        base_url=settings.GATEWAY_URL,
        api_key=settings.GATEWAY_API_KEY,
    )

    summary = await summarizer_mod.summarize_conversation(body.messages, llm_client)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    stored = await summarizer_mod.store_summary_in_mempalace(summary, active, date_str)

    return {"summary": summary, "stored": stored}


# ── Admin ────────────────────────────────────────────────────────────────────

@app.get("/admin/status")
async def admin_status(_: dict = Depends(require_admin)):
    from redis_client import redis_client
    from proactive import _replica_id, _LEADER_KEY
    from metrics import sse_clients_active

    redis_info = None
    pubsub_channels: dict = {}
    leader_id: str | None = None

    if redis_client:
        try:
            info = await redis_client.info()
            redis_info = {
                "memory": info.get("used_memory_human"),
                "connected_clients": info.get("connected_clients"),
                "ops_per_sec": info.get("instantaneous_ops_per_sec"),
            }
            leader_id = await redis_client.get(_LEADER_KEY)
            channels = await redis_client.pubsub_channels("*")
            if channels:
                pubsub_channels = await redis_client.pubsub_numsub(*channels)
        except Exception as e:
            logger.warning("Admin Redis stats failed: %s", e)

    sse_stats: dict = {}
    for stream in ["alerts", "swarm"]:
        try:
            sse_stats[stream] = int(sse_clients_active.labels(stream=stream)._value.get())
        except Exception:
            sse_stats[stream] = 0

    return {
        "replica_id": _replica_id,
        "is_leader": (leader_id == _replica_id) if leader_id else True,
        "leader_id": leader_id or _replica_id,
        "auth_warning": not settings.AUTH_ENABLED,
        "redis": redis_info,
        "pubsub_channels": pubsub_channels,
        "sse_clients": sse_stats,
    }


# ── Chat ──────────────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(body: ChatBody, user: dict = Depends(get_current_user)):
    from metrics import chat_requests_total
    chat_requests_total.inc()
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

        # RAG — fetch relevant memories before running the agent
        rag_context = ""
        if body.rag_enabled and effective_messages:
            last_user = next(
                (m for m in reversed(effective_messages) if m.get("role") == "user"), None
            )
            if last_user:
                rag_context, rag_sources = await rag_mod.fetch_rag_context(
                    last_user.get("content", ""), active
                )
                if rag_sources:
                    from metrics import rag_injections_total
                    rag_injections_total.inc(len(rag_sources))
                    yield json.dumps(
                        {"type": "rag_sources", "sources": rag_sources}, ensure_ascii=False
                    )

        async def on_chunk(chunk: dict):
            if chunk.get("type") == "tool_start":
                tools_used.append(chunk["name"])
            elif chunk.get("type") == "text":
                result_parts.append(chunk.get("content", ""))
            await queue.put(chunk)

        async def run_agent():
            try:
                await agent.stream_chat(effective_messages, on_chunk, rag_context=rag_context, model=body.model)
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
