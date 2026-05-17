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

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from jose import JWTError, jwt
import bcrypt

from mempalace.storage import get_palace_storage
from mempalace.document_storage import get_storage_backend, StorageBackend

# ── Config ───────────────────────────────────────────────────────
JWT_SECRET      = os.environ.get("JWT_SECRET", "change_this_in_production")
JWT_ALGORITHM   = "HS256"
JWT_EXPIRE_MIN  = int(os.environ.get("JWT_EXPIRE_MINUTES", "1440"))
PALACE_BASE     = os.environ.get("MEMPALACE_PALACE_BASE",
                    str(Path.home() / ".mempalace" / "palaces"))
DB_PATH         = os.environ.get("MEMPALACE_DB_PATH",
                    str(Path.home() / ".mempalace" / "users.db"))
ADMIN_TOKEN     = os.environ.get("MEMPALACE_ADMIN_TOKEN", "")
CORS_ORIGINS    = os.environ.get("CORS_ORIGINS",
                    "http://localhost:3000,http://localhost:8080").split(",")
# Keycloak dual-auth (optional)
KEYCLOAK_URL      = os.environ.get("KEYCLOAK_URL", "")
KEYCLOAK_REALM    = os.environ.get("KEYCLOAK_REALM", "forge")
KEYCLOAK_AUDIENCE = os.environ.get("KEYCLOAK_AUDIENCE", "")  # Multi-tenant: valeur = client_id Keycloak. Vide = verify_aud désactivé.

_jwks_cache: dict | None = None

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


async def _fetch_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    import httpx
    url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, timeout=5)
        r.raise_for_status()
    _jwks_cache = r.json()
    return _jwks_cache


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
    if KEYCLOAK_URL:
        try:
            jwks = await _fetch_jwks()
            decode_opts = ({"audience": KEYCLOAK_AUDIENCE}
                           if KEYCLOAK_AUDIENCE else {"verify_aud": False})
            payload = jwt.decode(token, jwks, algorithms=["RS256"], options=decode_opts)
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
app = FastAPI(title="MemPalace API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    _init_db()
    _init_docs_db()


# ── Health ───────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "module": "mempalace:api"}


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
    if not col:
        return {"results": []}

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
        ]
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
    meta = {
        "wing":     body.wing,
        "room":     body.room,
        "added_at": datetime.utcnow().isoformat(),
        "id":       drawer_id,
        **(body.metadata or {}),
    }
    col.add(ids=[drawer_id], documents=[body.content], metadatas=[meta])
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
