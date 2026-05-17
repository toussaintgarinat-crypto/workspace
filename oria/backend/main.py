from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base
import models.world, models.building, models.user, models.quartier, models.dm, models.network
import models.abonnement
import models.vote
import models.llm_config
import models.agent
import models.document
import models.ipcra
import models.social
import models.shared_zone
import models.coin
import models.resident_agent
from routers import worlds, buildings, rooms, tokens, auth, quartiers
from routers import invitations, files as files_router, network as network_router
from routers import abonnements as abonnements_router
from routers import matrix_as
from routers.agents_router   import router as agents_router
from routers.documents_router import router as documents_router
from routers.discovery_router import router as discovery_router
from routers.ipcra_router    import router as ipcra_router
from routers.conductor_router import router as conductor_router
import os

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Oria API", version="2.0.0")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for _candidate in ["/app/uploads", "/tmp/uploads",
                   os.path.abspath(os.path.join(os.path.dirname(__file__), "uploads"))]:
    try:
        os.makedirs(_candidate, exist_ok=True)
        UPLOAD_DIR = _candidate
        break
    except OSError:
        continue
else:
    UPLOAD_DIR = "/tmp/uploads"

try:
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
except Exception:
    pass

app.include_router(auth.router,            prefix="/api/auth",        tags=["Auth"])
app.include_router(worlds.router,          prefix="/api/worlds",      tags=["Worlds"])
app.include_router(buildings.router,       prefix="/api/buildings",   tags=["Buildings"])
app.include_router(rooms.router,           prefix="/api/rooms",       tags=["Rooms"])
app.include_router(tokens.router,          prefix="/api/tokens",      tags=["Tokens"])
app.include_router(quartiers.router,       prefix="/api/quartiers",   tags=["Quartiers"])
app.include_router(invitations.router,     prefix="/api/invitations", tags=["Invitations"])
app.include_router(files_router.router,    prefix="/api/files",       tags=["Files"])
app.include_router(network_router.router,      prefix="/api/network",     tags=["Network"])
app.include_router(abonnements_router.router,  prefix="/api",             tags=["Abonnements"])
from routers.vote_router import router as vote_router
from routers.search_router import router as search_router
from routers.reseau_router import router as reseau_router
from routers.llm_config_router import router as llm_config_router
app.include_router(vote_router,       prefix="/api/votes",      tags=["Votes"])
app.include_router(search_router,     prefix="/api/search",     tags=["Recherche"])
app.include_router(reseau_router,     prefix="/api/reseau",     tags=["Intercommunalité"])
app.include_router(llm_config_router, prefix="/api/llm-config", tags=["Config LLM"])
# ── Nouvelles fonctionnalités ──────────────────────────────────
app.include_router(agents_router,    prefix="/api/agents",    tags=["Agents IA"])
app.include_router(documents_router, prefix="/api/documents", tags=["Documents"])
app.include_router(discovery_router, prefix="/api/discover",  tags=["Découverte"])
app.include_router(ipcra_router,     prefix="/api/ipcra",     tags=["IPCRA"])
from routers.social_router import router as social_router
from routers.jardin_router import router as jardin_router
from routers.shared_zones_router import router as shared_zones_router
app.include_router(social_router,      prefix="/api/social",        tags=["Social"])
app.include_router(jardin_router,      prefix="/api/jardin",        tags=["Jardin Secret"])
app.include_router(shared_zones_router, prefix="/api/shared-zones", tags=["Zones partagées"])
from routers.coins_router import router as coins_router
app.include_router(coins_router, prefix="/api", tags=["Coins & Rooms payantes"])
app.include_router(conductor_router, prefix="/api/conductor", tags=["Conductor"])
# Application Service Matrix — montée sans préfixe /api (protocole Matrix)
app.include_router(matrix_as.router, tags=["Matrix AS"])

# ── Yjs CRDT WebSocket ─────────────────────────────────────────
from fastapi import WebSocket, WebSocketDisconnect
from yjs_server import yjs_websocket_handler

@app.websocket("/ws/yjs/{zone_id}")
async def yjs_ws(websocket: WebSocket, zone_id: str):
    await yjs_websocket_handler(websocket, zone_id)


# ── Conductor WebSocket ─────────────────────────────────────────
from services.conductor_ws import conductor_manager

@app.websocket("/ws/conductor")
async def conductor_ws(websocket: WebSocket):
    await conductor_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # garder la connexion vivante
    except WebSocketDisconnect:
        await conductor_manager.disconnect(websocket)


# ── Seeding des 5 agents résidents pôle ────────────────────────
from contextlib import asynccontextmanager

_POLE_AGENTS = [
    ("Finance",   "💰", "Expert financier — budgets, P&L, trésorerie, reporting CFO."),
    ("Marketing", "📢", "Expert marketing — brand, campagnes, leads, analytics."),
    ("Sales",     "🤝", "Expert commercial — pipeline CRM, deals, relances, prévisions."),
    ("Ops",       "⚙️", "Expert opérations — sprints, process, infra, delivery."),
    ("Legal",     "⚖️", "Expert juridique — contrats, conformité, IP, RGPD."),
]


def _seed_resident_agents():
    from database import SessionLocal
    from models.resident_agent import ResidentAgent
    forge_url   = os.getenv("FORGE_URL", "http://localhost:3001")
    forge_token = os.getenv("FORGE_TOKEN", "")
    db = SessionLocal()
    try:
        existing = {a.pole_type for a in db.query(ResidentAgent).all()}
        for pole, emoji, desc in _POLE_AGENTS:
            if pole not in existing:
                db.add(ResidentAgent(
                    name=f"Agent {pole}",
                    pole_type=pole,
                    avatar_emoji=emoji,
                    description=desc,
                    forge_url=forge_url,
                    forge_token=forge_token,
                ))
        db.commit()
    finally:
        db.close()


_seed_resident_agents()


@app.get("/")
def root():
    return {"app": "Oria", "status": "ok", "version": "3.0.0"}
