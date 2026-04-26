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

from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from jose import JWTError, jwt
from passlib.context import CryptContext

from mempalace.storage import get_palace_storage

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

# ── Helpers ──────────────────────────────────────────────────────
pwd_ctx       = CryptContext(schemes=["bcrypt"], deprecated="auto")
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
    hashed = pwd_ctx.hash(password)
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


def _create_token(user_id: str, username: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MIN)
    return jwt.encode(
        {"sub": user_id, "username": username, "exp": expire},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


async def _current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload  = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id  = payload.get("sub")
        username = payload.get("username")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"id": user_id, "username": username}
    except JWTError:
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
    if not user or not pwd_ctx.verify(form.password, user["hashed_pw"]):
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
    if not user or not pwd_ctx.verify(body.password, user["hashed_pw"]):
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
        **(body.metadata or {}),
    }
    col.add(ids=[drawer_id], documents=[body.content], metadatas=[meta])
    return {"id": drawer_id, "wing": body.wing, "room": body.room}


@app.delete("/api/drawers/{drawer_id}")
def delete_drawer(drawer_id: str, user: dict = Depends(_current_user)):
    col = get_palace_storage(_palace(user["id"]))
    if not col:
        raise HTTPException(status_code=404, detail="Palace not found")
    col.delete([drawer_id])
    return {"ok": True}
