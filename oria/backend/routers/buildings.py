from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from database import get_db
from models.building import Building, Room
from models.world import Member
from models.user import User
from models.abonnement import RoomAbonnement
from routers.auth import get_current_user
import uuid
import services.matrix_service as matrix

router = APIRouter()

CONFIGS_PAR_TYPE = {
    "maison":   {"emoji": "🏠", "couleur": "#E67E22", "rooms_defaut": [
        {"nom": "Salon",   "type": "mixte",  "emoji": "🛋", "etage": 0},
        {"nom": "Cuisine", "type": "texte",  "emoji": "🍳", "etage": 0},
        {"nom": "Bureau",  "type": "vocal",  "emoji": "💼", "etage": 0},
    ]},
    "site":     {"emoji": "🌐", "couleur": "#3498DB", "rooms_defaut": [
        {"nom": "Accueil",   "type": "mixte", "emoji": "👋", "etage": 0},
        {"nom": "Portfolio", "type": "texte", "emoji": "🖼", "etage": 0},
        {"nom": "Contact",   "type": "mixte", "emoji": "📬", "etage": 0},
    ]},
    "immeuble": {"emoji": "🏢", "couleur": "#9B59B6", "rooms_defaut": [
        {"nom": "Hall d'entrée", "type": "mixte", "emoji": "🚪", "etage": 0},
        {"nom": "Activité 1",   "type": "mixte", "emoji": "📋", "etage": 1},
        {"nom": "Activité 2",   "type": "mixte", "emoji": "📊", "etage": 2},
    ]},
}

class CreerBuilding(BaseModel):
    world_id:    str
    nom:         str
    type:        str = "maison"
    description: str = ""
    emoji:       str = ""
    couleur:     str = ""
    quartier_id: str = ""

class CreerRoom(BaseModel):
    building_id:          str
    nom:                  str
    type:                 str       = "mixte"
    etage:                int       = 0
    emoji:                str       = "💬"
    acces_restreint:      str       = "libre"   # libre | cadenas | cache
    abonnements_requis_ids: List[str] = []

class UpdateBuilding(BaseModel):
    nom:         str = ""
    description: str = ""
    emoji:       str = ""
    couleur:     str = ""

class UpdateRoom(BaseModel):
    nom:                    str       = ""
    type:                   str       = ""
    emoji:                  str       = ""
    acces_restreint:        str       = ""
    abonnements_requis_ids: List[str] = None

# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialise_room(r: Room) -> dict:
    abonnements = [
        {"id": ra.abonnement.id, "nom": ra.abonnement.nom, "couleur": ra.abonnement.couleur}
        for ra in r.abonnements_requis
    ]
    return {
        "id":                 r.id,
        "nom":                r.nom,
        "type":               r.type,
        "etage":              r.etage,
        "emoji":              r.emoji,
        "matrix_room_id":     r.matrix_room_id,
        "acces_restreint":    r.acces_restreint,
        "abonnements_requis": abonnements,
    }


# ── Rooms (avant /{building_id} pour éviter conflits) ────────────────────────

def _mxids_membres_world(world_id: str, db: Session) -> list[str]:
    """Retourne les MXID Matrix de tous les membres d'un world."""
    membres = db.query(Member).filter(Member.world_id == world_id).all()
    user_ids = [m.user_id for m in membres]
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return [u.matrix_user_id for u in users if u.matrix_user_id]


@router.post("/rooms")
def creer_room(data: CreerRoom, db: Session = Depends(get_db), user=Depends(get_current_user)):
    room = Room(
        id=str(uuid.uuid4()),
        building_id=data.building_id,
        nom=data.nom,
        type=data.type,
        etage=data.etage,
        emoji=data.emoji,
        acces_restreint=data.acces_restreint,
    )
    db.add(room)
    db.flush()

    # Lier les abonnements requis
    for abonnement_id in (data.abonnements_requis_ids or []):
        db.add(RoomAbonnement(room_id=room.id, abonnement_id=abonnement_id))

    # Créer la Matrix Room correspondante
    building = db.query(Building).filter(Building.id == data.building_id).first()
    if building:
        creator = db.query(User).filter(User.id == user["id"]).first()
        creator_mxid = creator.matrix_user_id if creator else None
        if creator_mxid:
            mxids = _mxids_membres_world(building.world_id, db)
            matrix_room_id = matrix.create_room(
                room_id=room.id,
                room_name=f"{data.emoji} {data.nom}",
                creator_mxid=creator_mxid,
                invited_mxids=mxids,
                encrypt=(data.type in ("texte", "mixte")),
            )
            if matrix_room_id:
                room.matrix_room_id = matrix_room_id

    db.commit()
    db.refresh(room)
    return _serialise_room(room)

@router.patch("/rooms/{room_id}")
def modifier_room(room_id: str, data: UpdateRoom, db: Session = Depends(get_db), user=Depends(get_current_user)):
    r = db.query(Room).filter(Room.id == room_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Pièce introuvable")
    if data.nom:            r.nom            = data.nom
    if data.type:           r.type           = data.type
    if data.emoji:          r.emoji          = data.emoji
    if data.acces_restreint: r.acces_restreint = data.acces_restreint
    if data.abonnements_requis_ids is not None:
        # Remplacer tous les abonnements requis
        db.query(RoomAbonnement).filter(RoomAbonnement.room_id == r.id).delete()
        for abonnement_id in data.abonnements_requis_ids:
            db.add(RoomAbonnement(room_id=r.id, abonnement_id=abonnement_id))
    db.commit()
    db.refresh(r)
    return _serialise_room(r)

@router.delete("/rooms/{room_id}")
def supprimer_room(room_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    r = db.query(Room).filter(Room.id == room_id).first()
    if r:
        db.delete(r)
        db.commit()
    return {"status": "ok"}

# ── Buildings ────────────────────────────────────────────────────────────────

@router.post("/")
def creer_building(data: CreerBuilding, db: Session = Depends(get_db), user=Depends(get_current_user)):
    config = CONFIGS_PAR_TYPE.get(data.type, CONFIGS_PAR_TYPE["maison"])
    building = Building(
        id=str(uuid.uuid4()),
        world_id=data.world_id,
        quartier_id=data.quartier_id or None,
        nom=data.nom,
        type=data.type,
        description=data.description,
        emoji=data.emoji or config["emoji"],
        couleur=data.couleur or config["couleur"],
    )
    db.add(building)
    db.flush()

    # Récupérer le créateur et les membres du world pour les invitations Matrix
    creator = db.query(User).filter(User.id == user["id"]).first()
    creator_mxid = creator.matrix_user_id if creator else None
    mxids = _mxids_membres_world(data.world_id, db) if creator_mxid else []

    for i, r in enumerate(config["rooms_defaut"]):
        room = Room(
            id=str(uuid.uuid4()),
            building_id=building.id,
            nom=r["nom"], type=r["type"],
            emoji=r["emoji"], etage=r["etage"], position=i,
        )
        db.add(room)
        db.flush()

        # Créer la Matrix Room pour chaque room par défaut
        if creator_mxid:
            matrix_room_id = matrix.create_room(
                room_id=room.id,
                room_name=f"{r['emoji']} {r['nom']}",
                creator_mxid=creator_mxid,
                invited_mxids=mxids,
                encrypt=(r["type"] in ("texte", "mixte")),
            )
            if matrix_room_id:
                room.matrix_room_id = matrix_room_id

    db.commit()
    db.refresh(building)
    rooms = [{"id": r.id, "nom": r.nom, "type": r.type, "etage": r.etage,
              "emoji": r.emoji, "matrix_room_id": r.matrix_room_id} for r in building.rooms]
    return {"id": building.id, "nom": building.nom, "type": building.type,
            "emoji": building.emoji, "couleur": building.couleur, "rooms": rooms}

@router.patch("/{building_id}")
def modifier_building(building_id: str, data: UpdateBuilding, db: Session = Depends(get_db), user=Depends(get_current_user)):
    b = db.query(Building).filter(Building.id == building_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bâtiment introuvable")
    if data.nom:                     b.nom         = data.nom
    if data.description is not None: b.description = data.description
    if data.emoji:                   b.emoji       = data.emoji
    if data.couleur:                 b.couleur     = data.couleur
    db.commit()
    db.refresh(b)
    return {"id": b.id, "nom": b.nom, "description": b.description, "emoji": b.emoji, "couleur": b.couleur}

@router.delete("/{building_id}")
def supprimer_building(building_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    b = db.query(Building).filter(Building.id == building_id).first()
    if b:
        db.delete(b)
        db.commit()
    return {"status": "ok"}
