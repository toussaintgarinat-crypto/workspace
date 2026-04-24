"""
Routers Oria Mairie — Délibérations, Arrêtés, Conseil Municipal,
Annuaire Agents/Élus, Tickets citoyens, Notifications publiques,
Audit trail, Tableau de bord.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import os, shutil, uuid

import logging
from database import get_db
from routers.auth import get_current_user

logger = logging.getLogger(__name__)
from models.world import World, Member
from models.building import Building
from models.mairie import (
    Deliberation, Arrete, ConseilMunicipal, AgentElu,
    Ticket, NotificationPublique, AuditLog
)

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/uploads" if os.path.exists("/app") else "./uploads")

def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

def _is_admin(db: Session, world_id: str, user_id: str) -> bool:
    m = db.query(Member).filter_by(world_id=world_id, user_id=user_id).first()
    return m and m.role in ("proprietaire", "admin")

def _log(db: Session, action: str, user=None, world_id=None, ressource=None, ressource_id=None, details=None, ip=None):
    db.add(AuditLog(
        world_id=world_id,
        user_id=user["id"] if user else None,
        user_nom=user["nom"] if user else None,
        action=action,
        ressource=ressource,
        ressource_id=ressource_id,
        details=details,
        ip=ip,
    ))
    db.commit()


# ─── DÉLIBÉRATIONS ────────────────────────────────────────────────────────────

deliberations_router = APIRouter()

class DelibIn(BaseModel):
    world_id: str
    numero: str
    titre: str
    date_seance: str
    statut: str = "en_cours"
    objet: str = ""
    confidentiel: bool = False

class DelibPatch(BaseModel):
    numero: Optional[str] = None
    titre: Optional[str] = None
    date_seance: Optional[str] = None
    statut: Optional[str] = None
    objet: Optional[str] = None
    confidentiel: Optional[bool] = None
    reseau_visible: Optional[bool] = None

@deliberations_router.post("/")
def creer_delib(body: DelibIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_admin(db, body.world_id, user["id"]):
        raise HTTPException(403, "Réservé aux admins")
    d = Deliberation(**body.dict(), created_by=user["id"])
    db.add(d); db.commit(); db.refresh(d)
    _log(db, "create_deliberation", user, body.world_id, "deliberation", d.id, d.titre)
    return _delib_dict(d)

@deliberations_router.get("/world/{world_id}")
def lister_delibs(world_id: str, statut: Optional[str] = None, archive: bool = False, db: Session = Depends(get_db), user=Depends(get_current_user)):
    admin = _is_admin(db, world_id, user["id"])
    q = db.query(Deliberation).filter_by(world_id=world_id)
    if not admin:
        q = q.filter_by(confidentiel=False)
    if statut:
        q = q.filter_by(statut=statut)
    if archive:
        q = q.filter(Deliberation.workflow_statut == "archive")
    else:
        q = q.filter(Deliberation.workflow_statut != "archive")
    return [_delib_dict(d) for d in q.order_by(Deliberation.date_seance.desc()).all()]

@deliberations_router.get("/{id}")
def get_delib(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = db.query(Deliberation).get(id)
    if not d: raise HTTPException(404)
    admin = _is_admin(db, d.world_id, user["id"])
    if d.confidentiel and not admin: raise HTTPException(403)
    return _delib_dict(d)

@deliberations_router.patch("/{id}")
def modifier_delib(id: str, body: DelibPatch, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = db.query(Deliberation).get(id)
    if not d: raise HTTPException(404)
    if not _is_admin(db, d.world_id, user["id"]): raise HTTPException(403)
    for k, v in body.dict(exclude_none=True).items():
        setattr(d, k, v)
    db.commit(); db.refresh(d)
    _log(db, "update_deliberation", user, d.world_id, "deliberation", d.id)
    return _delib_dict(d)

@deliberations_router.delete("/{id}")
def supprimer_delib(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = db.query(Deliberation).get(id)
    if not d: raise HTTPException(404)
    if not _is_admin(db, d.world_id, user["id"]): raise HTTPException(403)
    _log(db, "delete_deliberation", user, d.world_id, "deliberation", d.id, d.titre)
    db.delete(d); db.commit()
    return {"ok": True}

@deliberations_router.patch("/{id}/workflow")
def workflow_delib(id: str, statut_workflow: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Workflow: brouillon → soumis → signe → publie"""
    d = db.query(Deliberation).get(id)
    if not d: raise HTTPException(404)
    if not _is_admin(db, d.world_id, user["id"]): raise HTTPException(403)
    d.workflow_statut = statut_workflow
    db.commit(); db.refresh(d)
    _log(db, f"workflow_delib_{statut_workflow}", user, d.world_id, "deliberation", d.id)
    return _delib_dict(d)

@deliberations_router.post("/{id}/pdf")
async def upload_delib_pdf(id: str, file: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = db.query(Deliberation).get(id)
    if not d: raise HTTPException(404)
    if not _is_admin(db, d.world_id, user["id"]): raise HTTPException(403)
    dir_ = os.path.join(UPLOAD_DIR, "deliberations"); _ensure_dir(dir_)
    fname = f"{id}_{uuid.uuid4().hex[:8]}_{file.filename}"
    path = os.path.join(dir_, fname)
    with open(path, "wb") as f: shutil.copyfileobj(file.file, f)
    d.file_path = path; db.commit()
    return {"file_path": path, "nom": file.filename}

@deliberations_router.get("/{id}/pdf")
def download_delib_pdf(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = db.query(Deliberation).get(id)
    if not d or not d.file_path: raise HTTPException(404)
    return FileResponse(d.file_path, media_type="application/pdf", filename=os.path.basename(d.file_path))

def _delib_dict(d):
    return {"id": d.id, "world_id": d.world_id, "numero": d.numero, "titre": d.titre,
            "date_seance": d.date_seance, "statut": d.statut, "objet": d.objet,
            "confidentiel": d.confidentiel, "has_pdf": bool(d.file_path),
            "workflow_statut": d.workflow_statut,
            "reseau_visible": bool(getattr(d, 'reseau_visible', False)),
            "created_by": d.created_by, "created_at": d.created_at.isoformat() if d.created_at else None}


# ─── ARRÊTÉS ──────────────────────────────────────────────────────────────────

arretes_router = APIRouter()

class ArreteIn(BaseModel):
    world_id: str
    numero: str
    type_arrete: str = "municipal"
    date_arrete: str
    objet: str = ""
    confidentiel: bool = False

class ArretePatch(BaseModel):
    numero: Optional[str] = None
    type_arrete: Optional[str] = None
    date_arrete: Optional[str] = None
    objet: Optional[str] = None
    confidentiel: Optional[bool] = None
    reseau_visible: Optional[bool] = None

@arretes_router.post("/")
def creer_arrete(body: ArreteIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_admin(db, body.world_id, user["id"]): raise HTTPException(403)
    a = Arrete(**body.dict(), created_by=user["id"])
    db.add(a); db.commit(); db.refresh(a)
    _log(db, "create_arrete", user, body.world_id, "arrete", a.id, a.objet)
    return _arrete_dict(a)

@arretes_router.get("/world/{world_id}")
def lister_arretes(world_id: str, type_arrete: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    admin = _is_admin(db, world_id, user["id"])
    q = db.query(Arrete).filter_by(world_id=world_id)
    if not admin: q = q.filter_by(confidentiel=False)
    if type_arrete: q = q.filter_by(type_arrete=type_arrete)
    return [_arrete_dict(a) for a in q.order_by(Arrete.date_arrete.desc()).all()]

@arretes_router.get("/{id}")
def get_arrete(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(Arrete).get(id)
    if not a: raise HTTPException(404)
    if a.confidentiel and not _is_admin(db, a.world_id, user["id"]): raise HTTPException(403)
    return _arrete_dict(a)

@arretes_router.patch("/{id}")
def modifier_arrete(id: str, body: ArretePatch, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(Arrete).get(id)
    if not a: raise HTTPException(404)
    if not _is_admin(db, a.world_id, user["id"]): raise HTTPException(403)
    for k, v in body.dict(exclude_none=True).items(): setattr(a, k, v)
    db.commit(); db.refresh(a)
    _log(db, "update_arrete", user, a.world_id, "arrete", a.id)
    return _arrete_dict(a)

@arretes_router.delete("/{id}")
def supprimer_arrete(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(Arrete).get(id)
    if not a: raise HTTPException(404)
    if not _is_admin(db, a.world_id, user["id"]): raise HTTPException(403)
    _log(db, "delete_arrete", user, a.world_id, "arrete", a.id, a.objet)
    db.delete(a); db.commit()
    return {"ok": True}

@arretes_router.patch("/{id}/workflow")
def workflow_arrete(id: str, statut_workflow: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(Arrete).get(id)
    if not a: raise HTTPException(404)
    if not _is_admin(db, a.world_id, user["id"]): raise HTTPException(403)
    a.workflow_statut = statut_workflow
    db.commit(); db.refresh(a)
    return _arrete_dict(a)

@arretes_router.post("/{id}/pdf")
async def upload_arrete_pdf(id: str, file: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(Arrete).get(id)
    if not a: raise HTTPException(404)
    if not _is_admin(db, a.world_id, user["id"]): raise HTTPException(403)
    dir_ = os.path.join(UPLOAD_DIR, "arretes"); _ensure_dir(dir_)
    fname = f"{id}_{uuid.uuid4().hex[:8]}_{file.filename}"
    path = os.path.join(dir_, fname)
    with open(path, "wb") as f: shutil.copyfileobj(file.file, f)
    a.file_path = path; db.commit()
    return {"file_path": path, "nom": file.filename}

@arretes_router.get("/{id}/pdf")
def download_arrete_pdf(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(Arrete).get(id)
    if not a or not a.file_path: raise HTTPException(404)
    return FileResponse(a.file_path, media_type="application/pdf", filename=os.path.basename(a.file_path))

def _arrete_dict(a):
    return {"id": a.id, "world_id": a.world_id, "numero": a.numero, "type_arrete": a.type_arrete,
            "date_arrete": a.date_arrete, "objet": a.objet, "confidentiel": a.confidentiel,
            "has_pdf": bool(a.file_path),
            "workflow_statut": a.workflow_statut,
            "reseau_visible": bool(getattr(a, 'reseau_visible', False)),
            "created_by": a.created_by, "created_at": a.created_at.isoformat() if a.created_at else None}


# ─── CONSEIL MUNICIPAL ────────────────────────────────────────────────────────

conseils_router = APIRouter()

class ConseilIn(BaseModel):
    world_id: str
    date_conseil: str
    heure: str = "18:00"
    lieu: str = "Salle du conseil"
    ordre_du_jour: str = ""

class ConseilPatch(BaseModel):
    date_conseil: Optional[str] = None
    heure: Optional[str] = None
    lieu: Optional[str] = None
    statut: Optional[str] = None
    ordre_du_jour: Optional[str] = None

@conseils_router.post("/")
def creer_conseil(body: ConseilIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_admin(db, body.world_id, user["id"]): raise HTTPException(403)
    c = ConseilMunicipal(**body.dict(), created_by=user["id"])
    db.add(c); db.commit(); db.refresh(c)

    # Envoi email convocations aux élus
    try:
        from services.email_service import send_convocation
        from models.mairie import AgentElu
        from models.world import World
        elus = db.query(AgentElu).filter_by(world_id=body.world_id, type_poste="elu", actif=True).all()
        world_obj = db.query(World).get(body.world_id)
        commune_nom = world_obj.nom if world_obj else "la mairie"
        for elu in elus:
            if elu.email_pro:
                send_convocation(elu.email_pro, f"{elu.prenom} {elu.nom}",
                               body.date_conseil, body.heure, body.lieu,
                               body.ordre_du_jour, commune_nom)
    except Exception as e:
        logger.warning(f"Convocations email échouées: {e}")

    # Convocation automatique dans le canal principal
    try:
        from models.building import Room
        rooms_world = db.query(Room).join(Building, Room.building_id == Building.id)\
            .filter(Building.world_id == body.world_id)\
            .filter(Room.matrix_room_id != None)\
            .filter(Room.type.in_(["texte", "broadcast", "mixte"]))\
            .first()
        if rooms_world and rooms_world.matrix_room_id:
            import services.matrix_service as matrix
            creator = db.query(__import__('models.user', fromlist=['User']).User).get(user["id"])
            if creator and creator.matrix_user_id:
                msg = (
                    f"📢 CONVOCATION — Conseil municipal\n"
                    f"📅 Date : {body.date_conseil}\n"
                    f"🕐 Heure : {body.heure}\n"
                    f"📍 Lieu : {body.lieu}\n"
                    f"\nOrdre du jour :\n{body.ordre_du_jour or '(à définir)'}"
                )
                matrix.send_message(rooms_world.matrix_room_id, creator.matrix_user_id, msg)
    except Exception as e:
        logger.warning(f"Convocation auto échouée : {e}")

    return _conseil_dict(c)

@conseils_router.get("/world/{world_id}")
def lister_conseils(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    items = db.query(ConseilMunicipal).filter_by(world_id=world_id).order_by(ConseilMunicipal.date_conseil).all()
    return [_conseil_dict(c) for c in items]

@conseils_router.get("/{id}")
def get_conseil(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(ConseilMunicipal).get(id)
    if not c: raise HTTPException(404)
    return _conseil_dict(c)

@conseils_router.patch("/{id}")
def modifier_conseil(id: str, body: ConseilPatch, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(ConseilMunicipal).get(id)
    if not c: raise HTTPException(404)
    if not _is_admin(db, c.world_id, user["id"]): raise HTTPException(403)
    for k, v in body.dict(exclude_none=True).items(): setattr(c, k, v)
    db.commit(); db.refresh(c)
    return _conseil_dict(c)

@conseils_router.delete("/{id}")
def supprimer_conseil(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(ConseilMunicipal).get(id)
    if not c: raise HTTPException(404)
    if not _is_admin(db, c.world_id, user["id"]): raise HTTPException(403)
    db.delete(c); db.commit()
    return {"ok": True}

@conseils_router.post("/{id}/pv")
async def upload_pv(id: str, file: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(ConseilMunicipal).get(id)
    if not c: raise HTTPException(404)
    if not _is_admin(db, c.world_id, user["id"]): raise HTTPException(403)
    dir_ = os.path.join(UPLOAD_DIR, "conseils"); _ensure_dir(dir_)
    fname = f"{id}_{file.filename}"
    path = os.path.join(dir_, fname)
    with open(path, "wb") as f: shutil.copyfileobj(file.file, f)
    c.pv_path = path; db.commit()
    return {"ok": True}

@conseils_router.get("/{id}/pv")
def download_pv(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(ConseilMunicipal).get(id)
    if not c or not c.pv_path: raise HTTPException(404)
    return FileResponse(c.pv_path, media_type="application/pdf", filename=os.path.basename(c.pv_path))

def _conseil_dict(c):
    return {"id": c.id, "world_id": c.world_id, "date_conseil": c.date_conseil,
            "heure": c.heure, "lieu": c.lieu, "statut": c.statut,
            "ordre_du_jour": c.ordre_du_jour, "has_pv": bool(c.pv_path),
            "created_by": c.created_by, "created_at": c.created_at.isoformat() if c.created_at else None}


# ─── ANNUAIRE ─────────────────────────────────────────────────────────────────

annuaire_router = APIRouter()

class AgentIn(BaseModel):
    world_id: str
    nom: str
    prenom: str
    type_poste: str = "agent"
    service: str = ""
    fonction: str = ""
    telephone: str = ""
    email_pro: str = ""
    bureau: str = ""
    user_id: Optional[str] = None

class AgentPatch(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    type_poste: Optional[str] = None
    service: Optional[str] = None
    fonction: Optional[str] = None
    telephone: Optional[str] = None
    email_pro: Optional[str] = None
    bureau: Optional[str] = None
    actif: Optional[bool] = None
    user_id: Optional[str] = None

@annuaire_router.post("/")
def creer_agent(body: AgentIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_admin(db, body.world_id, user["id"]): raise HTTPException(403)
    a = AgentElu(**body.dict())
    db.add(a); db.commit(); db.refresh(a)
    return _agent_dict(a)

@annuaire_router.get("/world/{world_id}")
def lister_agents(world_id: str, type_poste: Optional[str] = None, actif: bool = True, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(AgentElu).filter_by(world_id=world_id, actif=actif)
    if type_poste: q = q.filter_by(type_poste=type_poste)
    return [_agent_dict(a) for a in q.order_by(AgentElu.nom).all()]

@annuaire_router.get("/{id}")
def get_agent(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(AgentElu).get(id)
    if not a: raise HTTPException(404)
    return _agent_dict(a)

@annuaire_router.patch("/{id}")
def modifier_agent(id: str, body: AgentPatch, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(AgentElu).get(id)
    if not a: raise HTTPException(404)
    if not _is_admin(db, a.world_id, user["id"]): raise HTTPException(403)
    for k, v in body.dict(exclude_none=True).items(): setattr(a, k, v)
    db.commit(); db.refresh(a)
    return _agent_dict(a)

@annuaire_router.delete("/{id}")
def desactiver_agent(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    a = db.query(AgentElu).get(id)
    if not a: raise HTTPException(404)
    if not _is_admin(db, a.world_id, user["id"]): raise HTTPException(403)
    a.actif = False; db.commit()
    return {"ok": True}

@annuaire_router.post("/import")
async def importer_agents(world_id: str, file: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Import CSV : colonnes nom,prenom,type_poste,service,fonction,telephone,email_pro,bureau"""
    if not _is_admin(db, world_id, user["id"]): raise HTTPException(403)
    import csv, io
    content = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    imported = 0
    for row in reader:
        a = AgentElu(
            world_id=world_id,
            nom=row.get("nom", "").strip(),
            prenom=row.get("prenom", "").strip(),
            type_poste=row.get("type_poste", "agent").strip(),
            service=row.get("service", "").strip(),
            fonction=row.get("fonction", "").strip(),
            telephone=row.get("telephone", "").strip(),
            email_pro=row.get("email_pro", "").strip(),
            bureau=row.get("bureau", "").strip(),
        )
        if a.nom and a.prenom:
            db.add(a); imported += 1
    db.commit()
    return {"imported": imported}

def _agent_dict(a):
    return {"id": a.id, "world_id": a.world_id, "user_id": a.user_id,
            "nom": a.nom, "prenom": a.prenom, "type_poste": a.type_poste,
            "service": a.service, "fonction": a.fonction,
            "telephone": a.telephone, "email_pro": a.email_pro,
            "bureau": a.bureau, "actif": a.actif,
            "created_at": a.created_at.isoformat() if a.created_at else None}


# ─── TICKETS CITOYENS ─────────────────────────────────────────────────────────

tickets_router = APIRouter()

class TicketIn(BaseModel):
    world_id: str
    nom_citoyen: str
    email_citoyen: str
    type_demande: str = "autre"
    titre: str
    description: str = ""

class TicketPatch(BaseModel):
    statut: Optional[str] = None
    assigne_a: Optional[str] = None
    reponse: Optional[str] = None

@tickets_router.post("/")
def creer_ticket(body: TicketIn, db: Session = Depends(get_db)):
    # Accessible sans auth (portail public)
    world = db.query(World).get(body.world_id)
    if not world: raise HTTPException(404, "Commune introuvable")
    t = Ticket(**body.dict())
    db.add(t); db.commit(); db.refresh(t)
    return _ticket_dict(t)

@tickets_router.get("/world/{world_id}")
def lister_tickets(world_id: str, statut: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Ticket).filter_by(world_id=world_id)
    if statut: q = q.filter_by(statut=statut)
    return [_ticket_dict(t) for t in q.order_by(Ticket.created_at.desc()).all()]

@tickets_router.get("/{id}")
def get_ticket(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = db.query(Ticket).get(id)
    if not t: raise HTTPException(404)
    return _ticket_dict(t)

@tickets_router.patch("/{id}")
def modifier_ticket(id: str, body: TicketPatch, db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = db.query(Ticket).get(id)
    if not t: raise HTTPException(404)
    for k, v in body.dict(exclude_none=True).items(): setattr(t, k, v)
    t.updated_at = datetime.utcnow()
    db.commit(); db.refresh(t)
    # Envoi email si réponse fournie
    if body.reponse and t.email_citoyen:
        try:
            from services.email_service import send_ticket_response
            from models.world import World
            world_obj = db.query(World).get(t.world_id)
            commune_nom = world_obj.nom if world_obj else "la mairie"
            send_ticket_response(t.email_citoyen, t.nom_citoyen, t.titre, body.reponse, commune_nom)
        except Exception as e:
            logger.warning(f"Email ticket échoué: {e}")
    return _ticket_dict(t)

def _ticket_dict(t):
    return {"id": t.id, "world_id": t.world_id, "nom_citoyen": t.nom_citoyen,
            "email_citoyen": t.email_citoyen, "type_demande": t.type_demande,
            "titre": t.titre, "description": t.description, "statut": t.statut,
            "assigne_a": t.assigne_a, "reponse": t.reponse,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None}


# ─── NOTIFICATIONS PUBLIQUES ──────────────────────────────────────────────────

notifs_router = APIRouter()

class NotifIn(BaseModel):
    world_id: str
    titre: str
    contenu: str
    type_notif: str = "info"
    expire_at: Optional[str] = None

@notifs_router.post("/")
def creer_notif(body: NotifIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_admin(db, body.world_id, user["id"]): raise HTTPException(403)
    n = NotificationPublique(**body.dict(), created_by=user["id"])
    db.add(n); db.commit(); db.refresh(n)
    return _notif_dict(n)

@notifs_router.get("/world/{world_id}")
def lister_notifs(world_id: str, db: Session = Depends(get_db)):
    # Public — pas d'auth requise
    items = db.query(NotificationPublique).filter_by(world_id=world_id, active=True).order_by(NotificationPublique.created_at.desc()).all()
    return [_notif_dict(n) for n in items]

@notifs_router.delete("/{id}")
def supprimer_notif(id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    n = db.query(NotificationPublique).get(id)
    if not n: raise HTTPException(404)
    if not _is_admin(db, n.world_id, user["id"]): raise HTTPException(403)
    n.active = False; db.commit()
    return {"ok": True}

def _notif_dict(n):
    return {"id": n.id, "world_id": n.world_id, "titre": n.titre, "contenu": n.contenu,
            "type_notif": n.type_notif, "expire_at": n.expire_at, "active": n.active,
            "created_at": n.created_at.isoformat() if n.created_at else None}


# ─── AUDIT TRAIL ──────────────────────────────────────────────────────────────

audit_router = APIRouter()

@audit_router.get("/world/{world_id}")
def lister_logs(world_id: str, limit: int = 100, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_admin(db, world_id, user["id"]): raise HTTPException(403)
    logs = db.query(AuditLog).filter_by(world_id=world_id).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [{"id": l.id, "user_nom": l.user_nom, "action": l.action,
             "ressource": l.ressource, "ressource_id": l.ressource_id,
             "details": l.details, "ip": l.ip,
             "created_at": l.created_at.isoformat() if l.created_at else None} for l in logs]


# ─── TABLEAU DE BORD ──────────────────────────────────────────────────────────

tableau_router = APIRouter()

@tableau_router.get("/world/{world_id}")
def tableau_bord(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_admin(db, world_id, user["id"]): raise HTTPException(403)

    now = datetime.utcnow()
    annee_str = str(now.year)

    nb_agents = db.query(AgentElu).filter_by(world_id=world_id, type_poste="agent", actif=True).count()
    nb_elus   = db.query(AgentElu).filter_by(world_id=world_id, type_poste="elu",   actif=True).count()
    nb_membres = db.query(Member).filter_by(world_id=world_id).count()
    nb_services = db.query(Building).filter_by(world_id=world_id).count()

    delibs = db.query(Deliberation).filter_by(world_id=world_id).all()
    delibs_par_statut = {"adopte": 0, "rejete": 0, "en_cours": 0, "reporte": 0}
    for d in delibs:
        if d.statut in delibs_par_statut:
            delibs_par_statut[d.statut] += 1

    nb_arretes = db.query(Arrete).filter(Arrete.world_id == world_id, Arrete.date_arrete.like(f"{annee_str}%")).count()

    conseils = db.query(ConseilMunicipal).filter_by(world_id=world_id).order_by(ConseilMunicipal.date_conseil).all()
    prochain = next((c.date_conseil for c in conseils if c.statut == "planifie" and c.date_conseil >= now.date().isoformat()), None)
    mois_str = now.strftime("%Y-%m")
    nb_conseils_mois = sum(1 for c in conseils if c.date_conseil.startswith(mois_str))

    nb_tickets_nouveaux = db.query(Ticket).filter_by(world_id=world_id, statut="nouveau").count()

    return {
        "nb_agents": nb_agents,
        "nb_elus": nb_elus,
        "nb_membres_total": nb_membres,
        "nb_services": nb_services,
        "nb_deliberations_total": len(delibs),
        "deliberations_par_statut": delibs_par_statut,
        "nb_arretes_annee": nb_arretes,
        "prochain_conseil": prochain,
        "nb_conseils_mois": nb_conseils_mois,
        "nb_tickets_nouveaux": nb_tickets_nouveaux,
    }
