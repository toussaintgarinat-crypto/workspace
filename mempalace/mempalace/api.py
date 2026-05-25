"""
MemPalace HTTP API — FastAPI service with JWT auth.

Auth:    POST /auth/login    → access_token
         POST /auth/register → access_token (first user free, subsequent need MEMPALACE_ADMIN_TOKEN)

Palace:  all /api/* routes protected by Bearer token
         each user gets an isolated palace at MEMPALACE_PALACE_BASE/{user_id}/
"""
from __future__ import annotations

import os
import sqlite3
import uuid
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, BackgroundTasks, Query
from fastapi.responses import Response, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from jose import JWTError, jwt
import bcrypt

from agent_personnel_shared.fastapi_setup import setup_cors, setup_logging
from agent_personnel_shared.keycloak_auth import (
    KeycloakSettings,
    has_role,
    verify_token,
)
from mempalace.storage import get_palace_storage
from mempalace.document_storage import get_storage_backend, StorageBackend

# ── Config ───────────────────────────────────────────────────────
JWT_SECRET      = os.environ.get("JWT_SECRET", "change_this_in_production")
if os.environ.get("ENV", "").lower() == "production" and JWT_SECRET == "change_this_in_production":
    raise RuntimeError(
        "[FATAL] JWT_SECRET doit être défini en production. "
        "Génère-en un : openssl rand -base64 32"
    )
JWT_ALGORITHM   = "HS256"
JWT_EXPIRE_MIN  = int(os.environ.get("JWT_EXPIRE_MINUTES", "1440"))
PALACE_BASE     = os.environ.get("MEMPALACE_PALACE_BASE",
                    str(Path.home() / ".mempalace" / "palaces"))
DB_PATH         = os.environ.get("MEMPALACE_DB_PATH",
                    str(Path.home() / ".mempalace" / "users.db"))
ADMIN_TOKEN     = os.environ.get("MEMPALACE_ADMIN_TOKEN", "")
CORS_ORIGINS    = os.environ.get("CORS_ORIGINS", "")
# Degraded mode: keyword fallback when Qdrant is unavailable
QDRANT_FALLBACK_ENABLED = os.environ.get("QDRANT_FALLBACK_ENABLED", "false").lower() == "true"
# Keycloak dual-auth (optional)
KEYCLOAK_URL      = os.environ.get("KEYCLOAK_URL", "")
KEYCLOAK_REALM    = os.environ.get("KEYCLOAK_REALM", "forge")
KEYCLOAK_AUDIENCE = os.environ.get("KEYCLOAK_AUDIENCE", "")  # Multi-tenant: valeur = client_id Keycloak. Vide = verify_aud désactivé.

# Configuration Keycloak partagée — initialisée à la demande si KEYCLOAK_URL est défini.
_KC: Optional[KeycloakSettings] = (
    KeycloakSettings(url=KEYCLOAK_URL, realm=KEYCLOAK_REALM, audience=KEYCLOAK_AUDIENCE)
    if KEYCLOAK_URL else None
)

# ── Helpers ──────────────────────────────────────────────────────
def _hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def _verify_pw(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _init_db() -> None:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id           TEXT PRIMARY KEY,
            username     TEXT UNIQUE NOT NULL,
            hashed_pw    TEXT NOT NULL,
            created_at   TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def _get_user(username: str) -> dict | None:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT id, username, hashed_pw FROM users WHERE username = ?", (username,)
    ).fetchone()
    conn.close()
    if row:
        return {"id": row[0], "username": row[1], "hashed_pw": row[2]}
    return None


def _create_user(username: str, password: str) -> dict:
    uid    = str(uuid.uuid4())
    hashed = _hash_pw(password)
    conn   = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO users (id, username, hashed_pw, created_at) VALUES (?, ?, ?, ?)",
        (uid, username, hashed, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()
    return {"id": uid, "username": username}


def _user_count() -> int:
    conn  = sqlite3.connect(DB_PATH)
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    conn.close()
    return count


def _init_docs_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id               TEXT PRIMARY KEY,
            filename         TEXT NOT NULL,
            mime_type        TEXT NOT NULL,
            size             INTEGER NOT NULL,
            storage_backend  TEXT NOT NULL DEFAULT 'local',
            storage_path     TEXT NOT NULL,
            owner_id         TEXT NOT NULL,
            chunk_count      INTEGER DEFAULT 0,
            created_at       TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def _init_drawers_text_db() -> None:
    """Mirror table for keyword fallback when Qdrant is unavailable."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS drawers_text (
            drawer_id TEXT NOT NULL,
            owner_id  TEXT NOT NULL,
            content   TEXT NOT NULL,
            wing      TEXT NOT NULL DEFAULT 'Input',
            room      TEXT NOT NULL DEFAULT 'general',
            added_at  TEXT NOT NULL,
            PRIMARY KEY (owner_id, drawer_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_drawers_text_owner ON drawers_text(owner_id)")
    conn.commit()
    conn.close()


def _drawers_text_insert(owner_id: str, drawer_id: str, content: str, wing: str, room: str, added_at: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR REPLACE INTO drawers_text (drawer_id, owner_id, content, wing, room, added_at) VALUES (?, ?, ?, ?, ?, ?)",
        (drawer_id, owner_id, content, wing, room, added_at),
    )
    conn.commit()
    conn.close()


def _drawers_text_search(owner_id: str, query: str, n: int, wing: Optional[str], room: Optional[str]) -> list:
    conn = sqlite3.connect(DB_PATH)
    where_parts = ["owner_id = ?"]
    params: list = [owner_id]
    for term in query.lower().split()[:4]:
        where_parts.append("LOWER(content) LIKE ?")
        params.append(f"%{term}%")
    if wing:
        where_parts.append("wing = ?")
        params.append(wing)
    if room:
        where_parts.append("room = ?")
        params.append(room)
    params.append(n)
    sql = f"SELECT content, wing, room, added_at, drawer_id FROM drawers_text WHERE {' AND '.join(where_parts)} LIMIT ?"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [
        {
            "content": row[0],
            "metadata": {"wing": row[1], "room": row[2], "added_at": row[3]},
            "score": 0.75,
        }
        for row in rows
    ]


def _qdrant_available() -> bool:
    from mempalace.storage import QDRANT_URL
    if not QDRANT_URL:
        return True  # Local embedded mode is always available
    try:
        from qdrant_client import QdrantClient
        QdrantClient(url=QDRANT_URL, timeout=2).get_collections()
        return True
    except Exception:
        return False


def _register_document(
    doc_id: str, filename: str, mime_type: str, size: int,
    storage_backend: str, storage_path: str, owner_id: str,
) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """INSERT OR REPLACE INTO documents
           (id, filename, mime_type, size, storage_backend, storage_path, owner_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (doc_id, filename, mime_type, size, storage_backend,
         storage_path, owner_id, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()


_TEXT_EXTENSIONS = {
    ".txt", ".md", ".py", ".js", ".ts", ".jsx", ".tsx",
    ".json", ".yaml", ".yml", ".csv", ".xml", ".html", ".css",
}


def _extract_text(filename: str, mime_type: str, data: bytes) -> Optional[str]:
    ext = Path(filename).suffix.lower()
    if mime_type.startswith("text/") or ext in _TEXT_EXTENSIONS:
        return data.decode("utf-8", errors="replace")
    if mime_type == "application/pdf" or ext == ".pdf":
        try:
            import io
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(data))
            return "\n".join(
                p.extract_text() for p in reader.pages if p.extract_text()
            )
        except ImportError:
            pass
    return None


def _chunk_text(text: str, size: int = 512, overlap: int = 50) -> list[str]:
    chunks, i = [], 0
    while i < len(text):
        chunks.append(text[i: i + size])
        i += size - overlap
    return chunks


def _vectorize_document(
    doc_id: str, filename: str, mime_type: str, data: bytes,
    user_id: str, wing: str, room: str,
) -> None:
    text = _extract_text(filename, mime_type, data)
    if not text:
        return
    chunks = _chunk_text(text)
    if not chunks:
        return
    col = get_palace_storage(_palace(user_id), create=True)
    if not col:
        return
    ids   = [f"{doc_id}_c{i}" for i in range(len(chunks))]
    now   = datetime.utcnow().isoformat()
    metas = [
        {"wing": wing, "room": room, "doc_id": doc_id,
         "chunk_index": i, "source_filename": filename, "added_at": now}
        for i in range(len(chunks))
    ]
    batch = 32
    for start in range(0, len(ids), batch):
        col.add(
            ids=ids[start: start + batch],
            documents=chunks[start: start + batch],
            metadatas=metas[start: start + batch],
        )
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE documents SET chunk_count = ? WHERE id = ?", (len(chunks), doc_id))
    conn.commit()
    conn.close()


# Singleton storage backend (initialized on first use)
_storage_backend: Optional[StorageBackend] = None


def _get_storage() -> StorageBackend:
    global _storage_backend
    if _storage_backend is None:
        _storage_backend = get_storage_backend(PALACE_BASE)
    return _storage_backend


def _create_token(user_id: str, username: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MIN)
    return jwt.encode(
        {"sub": user_id, "username": username, "exp": expire},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


async def _current_user(token: str = Depends(oauth2_scheme)) -> dict:
    # Try local HS256 first
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id:
            return {"id": user_id, "username": payload.get("username", user_id)}
    except JWTError:
        pass

    # Try Keycloak RS256 if configured
    if _KC is not None:
        try:
            payload = await verify_token(token, _KC)
            user_id = payload.get("sub")
            if user_id:
                username = payload.get("preferred_username") or payload.get("nom") or user_id
                return {"id": user_id, "username": username}
        except Exception:
            pass

    raise HTTPException(status_code=401, detail="Invalid or expired token")


def _palace(user_id: str) -> str:
    path = Path(PALACE_BASE) / user_id
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


# ── App ──────────────────────────────────────────────────────────
setup_logging(level=os.environ.get("LOG_LEVEL", "INFO"), fmt=os.environ.get("LOG_FORMAT", "text"))

app = FastAPI(title="MemPalace API", version="3.0.0")

setup_cors(
    app,
    CORS_ORIGINS,
    default=["http://localhost:3000", "http://localhost:8080"],
)

# ── S99 — Versioning d'API + alias retro-compat ───────────────────────────
# MemPalace definit toutes ses routes via @app.get/post directs (pas d'APIRouter).
# Pour ne pas dupliquer 30 decorateurs, on utilise 2 middlewares :
# 1. Un middleware qui re-ecrit /v1/<path> → <path> AVANT le routing FastAPI
#    (le client peut donc appeler les deux formes, sans rien casser).
# 2. Un middleware qui ajoute Deprecation/Sunset sur les chemins non-/v1.
# Sunset : ~6 mois apres livraison S99.
_DEPRECATION_SUNSET_MP = "Mon, 23 Nov 2026 00:00:00 GMT"
_DEPRECATION_EXEMPT_MP = {"/health", "/docs", "/redoc", "/openapi.json", "/"}


@app.middleware("http")
async def _v1_alias_and_deprecation(request: Request, call_next):
    """Rewrite /v1/<x> → <x> et ajoute headers Deprecation sur l'alias legacy."""
    path = request.url.path
    via_v1 = path.startswith("/v1/")
    if via_v1:
        # On modifie le scope pour rediriger en interne (pas de 307).
        new_path = path[3:] or "/"
        request.scope["path"] = new_path
        request.scope["raw_path"] = new_path.encode("ascii")

    response = await call_next(request)
    if via_v1:
        return response  # nouveau client → pas de deprecation
    if path in _DEPRECATION_EXEMPT_MP:
        return response
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = _DEPRECATION_SUNSET_MP
    response.headers.setdefault("Link", f'</v1{path}>; rel="successor-version"')
    return response


@app.on_event("startup")
def startup() -> None:
    _init_db()
    _init_docs_db()
    _init_drawers_text_db()


# ── Health ───────────────────────────────────────────────────────

_DEGRADED_COMPONENTS_MP = ["qdrant", "minio", "export", "import"]
_DEGRADED_TOKEN_MP = os.environ.get("DEGRADED_WEBHOOK_TOKEN", "")
_REDIS_URL_MP = os.environ.get("REDIS_URL", "")
_MP_NAMESPACE = "mempalace"  # S101 — prefixe toutes les cles Redis pour eviter les collisions inter-services.
_redis_mp: Optional[object] = None


def _get_redis_mp():
    global _redis_mp
    if _redis_mp is not None:
        return _redis_mp
    if not _REDIS_URL_MP:
        return None
    try:
        import redis
        _redis_mp = redis.from_url(_REDIS_URL_MP, decode_responses=True)
        _redis_mp.ping()
        return _redis_mp
    except Exception:
        _redis_mp = None
        return None


def _mp_key(suffix: str) -> str:
    """Prefixe `mempalace:` sauf si la cle l'est deja."""
    return suffix if suffix.startswith(f"{_MP_NAMESPACE}:") else f"{_MP_NAMESPACE}:{suffix}"


def _mp_degraded_states() -> dict:
    rc = _get_redis_mp()
    env_defaults = {
        "qdrant": QDRANT_FALLBACK_ENABLED,
        "minio": False,
        "export": False,
        "import": False,
    }
    states: dict = {}
    for comp in _DEGRADED_COMPONENTS_MP:
        key = _mp_key(f"degraded:{comp}")
        fallback = env_defaults.get(comp, False)
        if rc:
            try:
                val = rc.get(key)
                degraded = (val == "1") if val is not None else fallback
            except Exception:
                degraded = fallback
        else:
            degraded = fallback
        states[comp] = {"degraded": degraded}
    return states


def _mp_set_degraded(component: str, degraded: bool, ttl: Optional[int] = None) -> bool:
    rc = _get_redis_mp()
    if not rc:
        return False
    key = _mp_key(f"degraded:{component}")
    val = "1" if degraded else "0"
    try:
        if ttl:
            rc.setex(key, ttl, val)
        else:
            rc.set(key, val)
        return True
    except Exception:
        return False


def _mp_require_admin(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("admin"):
            return payload
    except JWTError:
        pass
    if _KC is not None:
        try:
            from agent_personnel_shared.keycloak_auth import verify_token_sync
            payload = verify_token_sync(token, _KC)
            if has_role(payload, "admin"):
                return payload
        except Exception:
            pass
    raise HTTPException(status_code=403, detail="Admin role required")


import logging as _logging
_mp_logger = _logging.getLogger("mempalace.api")


@app.get("/health")
def health():
    """Schema unifie S101 (HealthBuilder) — endpoint sync (mempalace n'utilise pas asyncio)."""
    from agent_personnel_shared.health import HealthBuilder, STATUS_OK, STATUS_DEGRADED

    states = _mp_degraded_states()
    degraded_states = [c for c, v in states.items() if v["degraded"]]
    any_degraded = bool(degraded_states)
    if any_degraded:
        _mp_logger.warning("MemPalace running in degraded mode: %s", states)

    builder = HealthBuilder(
        "mempalace",
        version="1.0.0",
        metadata={
            "module": "mempalace:api",
            "degraded_states": degraded_states,
        },
        degraded=any_degraded,
    )
    # Redis check sync (mempalace utilise un client redis sync, pas asyncio)
    rc = _get_redis_mp()
    if rc is None:
        builder.add_dependency("redis", "down" if _REDIS_URL_MP else "ok", "unavailable" if _REDIS_URL_MP else None)
    else:
        try:
            rc.ping()
            builder.add_dependency("redis", STATUS_OK)
        except Exception as exc:
            builder.add_dependency("redis", "down", str(exc)[:120])
    # Detail par composant
    for comp, info in states.items():
        builder.add_dependency(comp, STATUS_DEGRADED if info["degraded"] else STATUS_OK)

    payload = builder.build()
    # Compat ancien format : on garde `module` et `degraded` top-level.
    payload["module"] = "mempalace:api"
    return payload


@app.get("/api/qdrant-status")
def qdrant_status(_user: dict = Depends(_current_user)):
    available = _qdrant_available()
    return {
        "available": available,
        "fallback_enabled": QDRANT_FALLBACK_ENABLED,
        "degraded": QDRANT_FALLBACK_ENABLED or not available,
    }


class MpDegradedToggleBody(BaseModel):
    component: str
    degraded: bool
    ttl: Optional[int] = None


class MpAlertWebhookBody(BaseModel):
    alerts: list
    status: str = "firing"


_MP_ALERT_COMPONENT_MAP = {
    "QdrantDown": "qdrant",
    "MinioDown": "minio",
}


@app.get("/admin/degraded")
def mp_get_degraded(_: dict = Depends(_mp_require_admin)):
    states = _mp_degraded_states()
    any_degraded = any(v["degraded"] for v in states.values())
    return {"service": "mempalace", "components": states, "any_degraded": any_degraded}


@app.post("/admin/degraded")
def mp_toggle_degraded(body: MpDegradedToggleBody, _: dict = Depends(_mp_require_admin)):
    if body.component not in _DEGRADED_COMPONENTS_MP:
        raise HTTPException(status_code=400, detail=f"Unknown component: {body.component}")
    ok = _mp_set_degraded(body.component, body.degraded, body.ttl)
    if body.degraded:
        _mp_logger.warning("Degraded mode ON for mempalace:%s", body.component)
    return {"ok": ok, "component": body.component, "degraded": body.degraded}


@app.post("/admin/degraded/auto")
def mp_degraded_webhook(body: MpAlertWebhookBody, request: Request):
    token = request.headers.get("X-Degraded-Token", "")
    if _DEGRADED_TOKEN_MP and token != _DEGRADED_TOKEN_MP:
        raise HTTPException(status_code=403, detail="Invalid token")

    toggled = []
    for alert in body.alerts:
        alertname = alert.get("labels", {}).get("alertname", "")
        component = _MP_ALERT_COMPONENT_MAP.get(alertname)
        if not component:
            continue
        degraded = body.status == "firing"
        ok = _mp_set_degraded(component, degraded)
        if degraded:
            _mp_logger.warning("Auto degraded ON for mempalace:%s (alert: %s)", component, alertname)
        toggled.append({"component": component, "degraded": degraded, "ok": ok})

    return {"ok": True, "toggled": toggled}


# ── Auth ─────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    username:    str
    password:    str
    admin_token: Optional[str] = None


@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = _get_user(form.username)
    if not user or not _verify_pw(form.password, user["hashed_pw"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": _create_token(user["id"], user["username"]), "token_type": "bearer"}


class ServiceTokenBody(BaseModel):
    username:     str
    password:     str
    expires_days: int = 365


@app.post("/auth/service-token")
def service_token(body: ServiceTokenBody):
    """Generate a long-lived token for service-to-service auth (Forge, Oria)."""
    user = _get_user(body.username)
    if not user or not _verify_pw(body.password, user["hashed_pw"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    days   = max(1, min(body.expires_days, 3650))
    expire = datetime.utcnow() + timedelta(days=days)
    token  = jwt.encode(
        {"sub": user["id"], "username": user["username"], "exp": expire, "type": "service"},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    return {
        "access_token": token,
        "token_type":   "bearer",
        "expires_at":   expire.isoformat(),
        "expires_days": days,
    }


@app.post("/auth/register", status_code=201)
def register(body: RegisterBody):
    if _user_count() > 0:
        if not ADMIN_TOKEN or body.admin_token != ADMIN_TOKEN:
            raise HTTPException(status_code=403, detail="Admin token required")
    if _get_user(body.username):
        raise HTTPException(status_code=409, detail="Username already taken")
    user  = _create_user(body.username, body.password)
    token = _create_token(user["id"], user["username"])
    return {"access_token": token, "token_type": "bearer", "user_id": user["id"]}


# ── Palace ───────────────────────────────────────────────────────

@app.get("/api/status")
def get_status(user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]))
    if not col:
        return {"total": 0, "wings": {}}
    all_metas = col.get(include=["metadatas"]).get("metadatas") or []
    wing_counts: dict[str, int] = {}
    for meta in all_metas:
        w = meta.get("wing", "unknown")
        wing_counts[w] = wing_counts.get(w, 0) + 1
    return {"total": col.count(), "wings": wing_counts}


@app.get("/api/wings")
def list_wings(user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]))
    if not col:
        return []
    wings: dict[str, int] = {}
    for meta in (col.get(include=["metadatas"]).get("metadatas") or []):
        w = meta.get("wing", "unknown")
        wings[w] = wings.get(w, 0) + 1
    return [{"wing": w, "count": c} for w, c in sorted(wings.items())]


@app.get("/api/wings/{wing}/rooms")
def list_rooms(wing: str, user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]))
    if not col:
        return []
    rooms: dict[str, int] = {}
    for meta in (col.get(where={"wing": wing}, include=["metadatas"]).get("metadatas") or []):
        r = meta.get("room", "general")
        rooms[r] = rooms.get(r, 0) + 1
    return [{"room": r, "count": c} for r, c in sorted(rooms.items())]


@app.get("/api/taxonomy")
def taxonomy(user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]))
    if not col:
        return {}
    tree: dict = {}
    for meta in (col.get(include=["metadatas"]).get("metadatas") or []):
        w = meta.get("wing", "unknown")
        r = meta.get("room", "general")
        tree.setdefault(w, {}).setdefault(r, 0)
        tree[w][r] += 1
    return tree


class SearchBody(BaseModel):
    query:     str
    wing:      Optional[str] = None
    room:      Optional[str] = None
    n_results: int = 5


@app.post("/api/search")
def search(body: SearchBody, user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]))

    if QDRANT_FALLBACK_ENABLED or col is None:
        results = _drawers_text_search(user["id"], body.query, body.n_results, body.wing, body.room)
        return {"results": results, "degraded": True, "fallback": "keyword"}

    where = None
    if body.wing and body.room:
        where = {"$and": [{"wing": body.wing}, {"room": body.room}]}
    elif body.wing:
        where = {"wing": body.wing}
    elif body.room:
        where = {"room": body.room}

    kwargs: dict = {
        "query_texts": [body.query],
        "n_results":   body.n_results,
        "include":     ["documents", "metadatas", "distances"],
    }
    if where:
        kwargs["where"] = where

    res   = col.query(**kwargs)
    docs  = res["documents"][0]
    metas = res["metadatas"][0]
    dists = res["distances"][0]

    return {
        "results": [
            {"content": doc, "metadata": meta, "score": round(1 - dist, 4)}
            for doc, meta, dist in zip(docs, metas, dists)
        ],
        "degraded": False,
    }


class DrawerBody(BaseModel):
    content:  str
    wing:     str
    room:     str = "general"
    metadata: Optional[dict] = None


@app.post("/api/drawers", status_code=201)
def add_drawer(body: DrawerBody, user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]), create=True)
    if not col:
        raise HTTPException(status_code=503, detail="Storage unavailable")

    drawer_id = hashlib.sha256(body.content.encode()).hexdigest()[:16]
    now = datetime.utcnow().isoformat()
    meta = {
        "wing":     body.wing,
        "room":     body.room,
        "added_at": now,
        "id":       drawer_id,
        **(body.metadata or {}),
    }
    col.add(ids=[drawer_id], documents=[body.content], metadatas=[meta])
    _drawers_text_insert(user["id"], drawer_id, body.content, body.wing, body.room, now)
    return {"id": drawer_id, "wing": body.wing, "room": body.room}


@app.get("/api/wings/{wing}/drawers")
def list_wing_drawers(wing: str, limit: int = 50, user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]))
    if not col:
        return []
    results = col.get(where={"wing": wing}, limit=limit, include=["documents", "metadatas"])
    docs  = results.get("documents", [])
    metas = results.get("metadatas", [])
    ids   = results.get("ids", [])
    return [
        {"content": doc, "metadata": meta, "id": oid}
        for doc, meta, oid in zip(docs, metas, ids)
    ]


@app.delete("/api/drawers/{drawer_id}")
def delete_drawer(drawer_id: str, user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]))
    if not col:
        raise HTTPException(status_code=404, detail="Palace not found")
    col.delete([drawer_id])
    return {"ok": True}


# ── Documents (original file + vectorized chunks) ─────────────────

@app.post("/api/documents", status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    wing: str = "documents",
    room: str = "files",
    user: dict = Depends(_current_user),
):
    data     = await file.read()
    doc_id   = hashlib.sha256(data).hexdigest()[:16]
    filename = file.filename or "unnamed"
    mime     = file.content_type or "application/octet-stream"
    backend  = os.environ.get("MEMPALACE_STORAGE", "local")

    storage_path = _get_storage().save(user["id"], doc_id, filename, data)
    _register_document(
        doc_id=doc_id, filename=filename, mime_type=mime, size=len(data),
        storage_backend=backend, storage_path=storage_path, owner_id=user["id"],
    )
    background_tasks.add_task(
        _vectorize_document, doc_id, filename, mime, data, user["id"], wing, room,
    )
    return {"id": doc_id, "filename": filename, "size": len(data), "wing": wing, "room": room}


@app.get("/api/documents")
def list_documents(user: dict = Depends(_current_user)):
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT id, filename, mime_type, size, chunk_count, created_at "
        "FROM documents WHERE owner_id = ? ORDER BY created_at DESC",
        (user["id"],),
    ).fetchall()
    conn.close()
    return [
        {"id": r[0], "filename": r[1], "mime_type": r[2],
         "size": r[3], "chunk_count": r[4], "created_at": r[5]}
        for r in rows
    ]


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str, user: dict = Depends(_current_user)):
    conn = sqlite3.connect(DB_PATH)
    row  = conn.execute(
        "SELECT id, filename, mime_type, size, storage_backend, chunk_count, created_at "
        "FROM documents WHERE id = ? AND owner_id = ?",
        (doc_id, user["id"]),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": row[0], "filename": row[1], "mime_type": row[2], "size": row[3],
        "storage_backend": row[4], "chunk_count": row[5], "created_at": row[6],
    }


@app.get("/api/documents/{doc_id}/download")
def download_document(doc_id: str, user: dict = Depends(_current_user)):
    conn = sqlite3.connect(DB_PATH)
    row  = conn.execute(
        "SELECT filename, mime_type, storage_path FROM documents WHERE id = ? AND owner_id = ?",
        (doc_id, user["id"]),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    filename, mime_type, storage_path = row
    data = _get_storage().load(storage_path)
    return Response(
        content=data,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/export")
def export_drawers(
    format: str = Query("json", regex="^(json|markdown)$"),
    user: dict = Depends(_current_user),
):
    col = get_palace_storage(_palace(user["id"]))
    if not col:
        items = []
    else:
        res   = col.get(include=["documents", "metadatas"])
        ids   = res.get("ids", [])
        docs  = res.get("documents", [])
        metas = res.get("metadatas", [])
        items = [
            {
                "id":       oid,
                "content":  doc,
                "wing":     meta.get("wing", ""),
                "room":     meta.get("room", "general"),
                "added_at": meta.get("added_at", ""),
            }
            for oid, doc, meta in zip(ids, docs, metas)
            if not meta.get("parent_id")  # skip sub-chunks
        ]

    if format == "markdown":
        import io
        from collections import defaultdict
        grouped: dict[str, list] = defaultdict(list)
        for item in items:
            grouped[item["wing"] or "general"].append(item)
        lines = [f"# MemPalace export — {datetime.utcnow().strftime('%Y-%m-%d')}\n"]
        for wing, entries in sorted(grouped.items()):
            lines.append(f"\n## {wing}\n")
            for e in entries:
                lines.append(f"### {e['room']} · {e['added_at'][:10] if e['added_at'] else ''}\n")
                lines.append(e["content"])
                lines.append("\n---\n")
        content = "\n".join(lines)
        return StreamingResponse(
            iter([content]),
            media_type="text/markdown",
            headers={"Content-Disposition": 'attachment; filename="mempalace_export.md"'},
        )

    import json as _json
    content = _json.dumps(items, ensure_ascii=False, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="mempalace_export.json"'},
    )


class ImportBody(BaseModel):
    entries: list[dict]


@app.post("/api/import")
def import_drawers(body: ImportBody, user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]), create=True)
    if not col:
        raise HTTPException(status_code=503, detail="Storage unavailable")

    existing_ids: set[str] = set()
    try:
        res = col.get(include=[])
        existing_ids = set(res.get("ids", []))
    except Exception:
        pass

    added, skipped = 0, 0
    now = datetime.utcnow().isoformat()
    for entry in body.entries:
        content = str(entry.get("content", "")).strip()
        if not content:
            skipped += 1
            continue
        drawer_id = hashlib.sha256(content.encode()).hexdigest()[:16]
        if drawer_id in existing_ids:
            skipped += 1
            continue
        wing = entry.get("wing", "Input")
        room = entry.get("room", "general")
        added_at = entry.get("added_at", now)
        meta = {"wing": wing, "room": room, "added_at": added_at, "id": drawer_id}
        col.add(ids=[drawer_id], documents=[content], metadatas=[meta])
        _drawers_text_insert(user["id"], drawer_id, content, wing, room, added_at)
        existing_ids.add(drawer_id)
        added += 1

    return {"added": added, "skipped": skipped, "total": len(body.entries)}


@app.get("/api/export/full")
def export_full(user: dict = Depends(_current_user)):
    """ZIP complet : drawers Qdrant + métadonnées SQL + fichiers originaux."""
    import io, zipfile, json as _json

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Drawers (Qdrant)
        col = get_palace_storage(_palace(user["id"]))
        if col:
            res   = col.get(include=["documents", "metadatas"])
            ids   = res.get("ids", [])
            docs  = res.get("documents", [])
            metas = res.get("metadatas", [])
            drawers = [
                {
                    "id":       oid,
                    "content":  doc,
                    "wing":     meta.get("wing", ""),
                    "room":     meta.get("room", "general"),
                    "added_at": meta.get("added_at", ""),
                }
                for oid, doc, meta in zip(ids, docs, metas)
                if not meta.get("parent_id")
            ]
        else:
            drawers = []
        zf.writestr("drawers.json", _json.dumps(drawers, ensure_ascii=False, indent=2))

        # 2. Documents metadata (SQL)
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            "SELECT id, filename, mime_type, size, storage_backend, storage_path, chunk_count, created_at "
            "FROM documents WHERE owner_id = ? ORDER BY created_at ASC",
            (user["id"],),
        ).fetchall()
        conn.close()
        docs_meta = [
            {
                "id": r[0], "filename": r[1], "mime_type": r[2], "size": r[3],
                "storage_backend": r[4], "storage_path": r[5],
                "chunk_count": r[6], "created_at": r[7],
            }
            for r in rows
        ]
        zf.writestr("documents_meta.json", _json.dumps(docs_meta, ensure_ascii=False, indent=2))

        # 3. Fichiers binaires originaux
        storage = _get_storage()
        for doc in docs_meta:
            try:
                file_data = storage.load(doc["storage_path"])
                zf.writestr(f"files/{doc['id']}/{doc['filename']}", file_data)
            except Exception:
                pass  # Fichier manquant → ignoré sans bloquer le reste

    buf.seek(0)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="mempalace_full_{ts}.zip"'},
    )


@app.post("/api/import/full")
async def import_full(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: dict = Depends(_current_user),
):
    """Réimporte un ZIP complet (drawers + fichiers) sur une instance vierge ou existante."""
    import io, zipfile, json as _json

    raw = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Fichier ZIP invalide")

    names = set(zf.namelist())
    result = {
        "drawers":   {"added": 0, "skipped": 0},
        "documents": {"added": 0, "skipped": 0, "errors": 0},
    }

    # 1. Import drawers
    if "drawers.json" in names:
        drawers = _json.loads(zf.read("drawers.json"))
        col = get_palace_storage(_palace(user["id"]), create=True)
        if col:
            existing_ids: set[str] = set()
            try:
                res = col.get(include=[])
                existing_ids = set(res.get("ids", []))
            except Exception:
                pass
            now = datetime.utcnow().isoformat()
            for entry in drawers:
                content = str(entry.get("content", "")).strip()
                if not content:
                    result["drawers"]["skipped"] += 1
                    continue
                drawer_id = hashlib.sha256(content.encode()).hexdigest()[:16]
                if drawer_id in existing_ids:
                    result["drawers"]["skipped"] += 1
                    continue
                wing     = entry.get("wing", "Input")
                room     = entry.get("room", "general")
                added_at = entry.get("added_at", now)
                meta = {"wing": wing, "room": room, "added_at": added_at, "id": drawer_id}
                col.add(ids=[drawer_id], documents=[content], metadatas=[meta])
                _drawers_text_insert(user["id"], drawer_id, content, wing, room, added_at)
                existing_ids.add(drawer_id)
                result["drawers"]["added"] += 1

    # 2. Import documents
    if "documents_meta.json" in names:
        docs_meta = _json.loads(zf.read("documents_meta.json"))
        conn = sqlite3.connect(DB_PATH)
        existing_doc_ids: set[str] = set(
            r[0] for r in conn.execute(
                "SELECT id FROM documents WHERE owner_id = ?", (user["id"],)
            ).fetchall()
        )
        conn.close()

        storage = _get_storage()
        backend = os.environ.get("MEMPALACE_STORAGE", "local")

        for doc in docs_meta:
            doc_id   = doc["id"]
            filename = doc["filename"]
            mime     = doc["mime_type"]

            if doc_id in existing_doc_ids:
                result["documents"]["skipped"] += 1
                continue

            arc_path = f"files/{doc_id}/{filename}"
            if arc_path not in names:
                result["documents"]["errors"] += 1
                continue

            try:
                file_data    = zf.read(arc_path)
                storage_path = storage.save(user["id"], doc_id, filename, file_data)
                _register_document(
                    doc_id=doc_id, filename=filename, mime_type=mime,
                    size=len(file_data), storage_backend=backend,
                    storage_path=storage_path, owner_id=user["id"],
                )
                background_tasks.add_task(
                    _vectorize_document, doc_id, filename, mime, file_data,
                    user["id"], "Input", "general",
                )
                existing_doc_ids.add(doc_id)
                result["documents"]["added"] += 1
            except Exception:
                result["documents"]["errors"] += 1

    return result


@app.delete("/api/documents/{doc_id}", status_code=204)
def delete_document(doc_id: str, user: dict = Depends(_current_user)):
    conn = sqlite3.connect(DB_PATH)
    row  = conn.execute(
        "SELECT storage_path, chunk_count FROM documents WHERE id = ? AND owner_id = ?",
        (doc_id, user["id"]),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")
    storage_path, chunk_count = row
    conn.execute("DELETE FROM documents WHERE id = ? AND owner_id = ?", (doc_id, user["id"]))
    conn.commit()
    conn.close()

    try:
        _get_storage().delete(storage_path)
    except Exception:
        pass

    col = get_palace_storage(_palace(user["id"]))
    if col and chunk_count:
        col.delete([f"{doc_id}_c{i}" for i in range(chunk_count)])


# ── LLM classify (IPCRA via gateway) ─────────────────────────────

GATEWAY_URL = os.environ.get("GATEWAY_URL", "")
GATEWAY_KEY = os.environ.get("GATEWAY_API_KEY", "sk-mempalace")
GATEWAY_MODEL = os.environ.get("GATEWAY_MODEL", "openai/gpt-4o-mini")

_IPCRA_PROMPT = """Tu es un assistant de classement IPCRA (système PKM d'Eliott Meunier).
Les 5 catégories IPCRA sont :
- Input : information brute, article, note de lecture, idée à traiter
- Projet : tâche active, projet en cours, sprint, objectif à atteindre
- Casquette : rôle, identité, responsabilité (ex: "en tant que CTO", "en tant que père")
- Ressource : référence durable, template, checklist, procédure, outil
- Archive : contenu terminé, décision passée, projet clôturé

Analyse le contenu suivant et retourne uniquement un JSON avec :
- "category" : une des 5 catégories exactes
- "room" : un sous-dossier court suggéré (1-3 mots, slug kebab-case)
- "confidence" : nombre entre 0 et 1
- "reason" : une phrase courte expliquant pourquoi"""

_IPCRA_CATEGORIES = {"Input", "Projet", "Casquette", "Ressource", "Archive"}


class ClassifyBody(BaseModel):
    content: str
    hint: Optional[str] = None


@app.post("/api/classify")
async def classify_ipcra(body: ClassifyBody, user: dict = Depends(_current_user)):
    if not GATEWAY_URL:
        return {"category": None, "room": "general", "confidence": 0,
                "reason": "LLM gateway not configured", "available": False}

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(base_url=GATEWAY_URL, api_key=GATEWAY_KEY)

        user_msg = body.content
        if body.hint:
            user_msg = f"[Contexte utilisateur : {body.hint}]\n\n{body.content}"

        resp = await client.chat.completions.create(
            model=GATEWAY_MODEL,
            messages=[
                {"role": "system", "content": _IPCRA_PROMPT},
                {"role": "user", "content": user_msg[:4000]},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )

        import json
        data = json.loads(resp.choices[0].message.content)
        category = data.get("category", "Input")
        if category not in _IPCRA_CATEGORIES:
            category = "Input"
        return {
            "category": category,
            "room": data.get("room", "general"),
            "confidence": float(data.get("confidence", 0.7)),
            "reason": data.get("reason", ""),
            "available": True,
        }
    except Exception as exc:
        return {"category": None, "room": "general", "confidence": 0,
                "reason": str(exc), "available": False}
