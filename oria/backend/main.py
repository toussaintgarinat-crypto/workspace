from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base
import models.world, models.building, models.user, models.quartier, models.dm, models.network
import models.abonnement
import models.mairie
import models.vote
import models.llm_config
import models.agent
import models.document
import models.ipcra
from routers import worlds, buildings, rooms, tokens, auth, quartiers
from routers import invitations, files as files_router, network as network_router
from routers import abonnements as abonnements_router
from routers import matrix_as
from routers.agents_router   import router as agents_router
from routers.documents_router import router as documents_router
from routers.discovery_router import router as discovery_router
from routers.ipcra_router    import router as ipcra_router
import os

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Oria API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
from routers.mairie import (deliberations_router, arretes_router, conseils_router,
    annuaire_router, tickets_router, notifs_router, audit_router, tableau_router)
app.include_router(deliberations_router, prefix="/api/deliberations", tags=["Délibérations"])
app.include_router(arretes_router,       prefix="/api/arretes",       tags=["Arrêtés"])
app.include_router(conseils_router,      prefix="/api/conseils",      tags=["Conseil Municipal"])
app.include_router(annuaire_router,      prefix="/api/annuaire",      tags=["Annuaire"])
app.include_router(tickets_router,       prefix="/api/tickets",       tags=["Tickets Citoyens"])
app.include_router(notifs_router,        prefix="/api/notifs",        tags=["Notifications"])
app.include_router(audit_router,         prefix="/api/audit",         tags=["Audit"])
app.include_router(tableau_router,       prefix="/api/tableau-bord",  tags=["Tableau de bord"])
from routers.vote_router import router as vote_router
from routers.search_router import router as search_router
from routers.ai_router import router as ai_router
from routers.reseau_router import router as reseau_router
from routers.llm_config_router import router as llm_config_router
app.include_router(vote_router,       prefix="/api/votes",      tags=["Votes"])
app.include_router(search_router,     prefix="/api/search",     tags=["Recherche"])
app.include_router(ai_router,         prefix="/api/ai",         tags=["IA Municipale"])
app.include_router(reseau_router,     prefix="/api/reseau",     tags=["Intercommunalité"])
app.include_router(llm_config_router, prefix="/api/llm-config", tags=["Config LLM"])
# ── Nouvelles fonctionnalités ──────────────────────────────────
app.include_router(agents_router,    prefix="/api/agents",    tags=["Agents IA"])
app.include_router(documents_router, prefix="/api/documents", tags=["Documents"])
app.include_router(discovery_router, prefix="/api/discover",  tags=["Découverte"])
app.include_router(ipcra_router,     prefix="/api/ipcra",     tags=["IPCRA"])
# Application Service Matrix — montée sans préfixe /api (protocole Matrix)
app.include_router(matrix_as.router, tags=["Matrix AS"])

@app.get("/")
def root():
    return {"app": "Oria", "status": "ok", "version": "3.0.0"}
