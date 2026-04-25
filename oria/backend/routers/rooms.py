from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from database import get_db
from models.building import Room, Building
from models.abonnement import RoomAbonnement
from routers.auth import get_current_user
import uuid
import services.matrix_service as matrix

router = APIRouter()

class CreerRoom(BaseModel):
    nom:                    str
    type:                   str       = "mixte"
    etage:                  int       = 0
    emoji:                  str       = "💬"
    acces_restreint:        str       = "libre"   # libre | cadenas | cache
    abonnements_requis_ids: List[str] = []

class UpdateRoom(BaseModel):
    nom:                    str       = ""
    type:                   str       = ""
    emoji:                  str       = ""
    acces_restreint:        str       = ""
    abonnements_requis_ids: List[str] = None


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
        "building_id":        r.building_id,
        "matrix_room_id":     r.matrix_room_id,
        "acces_restreint":    r.acces_restreint,
        "abonnements_requis": abonnements,
    }


@router.get("/{room_id}")
def get_room(room_id: str, db: Session = Depends(get_db)):
    r = db.query(Room).filter(Room.id == room_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Room introuvable")
    return _serialise_room(r)


@router.get("/{building_id}/rooms")
def lister_rooms(building_id: str, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building introuvable")
    return [_serialise_room(r) for r in building.rooms]


@router.post("/{building_id}/rooms")
def creer_room(building_id: str, data: CreerRoom, db: Session = Depends(get_db), user=Depends(get_current_user)):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building introuvable")

    room = Room(
        id=str(uuid.uuid4()),
        building_id=building_id,
        nom=data.nom,
        type=data.type,
        etage=data.etage,
        emoji=data.emoji,
        acces_restreint=data.acces_restreint,
    )
    db.add(room)
    db.flush()

    for abonnement_id in (data.abonnements_requis_ids or []):
        db.add(RoomAbonnement(room_id=room.id, abonnement_id=abonnement_id))

    # Créer la Matrix Room correspondante
    creator = None
    try:
        from models.user import User
        creator = db.query(User).filter(User.id == user["id"]).first()
    except Exception:
        pass
    creator_mxid = creator.matrix_user_id if creator else None
    if creator_mxid:
        matrix_room_id = matrix.create_room(
            room_id=room.id,
            room_name=f"{data.emoji} {data.nom}",
            creator_mxid=creator_mxid,
            invited_mxids=[],
            encrypt=(data.type in ("texte", "mixte")),
        )
        if matrix_room_id:
            room.matrix_room_id = matrix_room_id

    db.commit()
    db.refresh(room)
    return _serialise_room(room)


@router.patch("/{room_id}")
def modifier_room(room_id: str, data: UpdateRoom, db: Session = Depends(get_db), user=Depends(get_current_user)):
    r = db.query(Room).filter(Room.id == room_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Room introuvable")
    if data.nom:             r.nom             = data.nom
    if data.type:            r.type            = data.type
    if data.emoji:           r.emoji           = data.emoji
    if data.acces_restreint: r.acces_restreint = data.acces_restreint
    if data.abonnements_requis_ids is not None:
        db.query(RoomAbonnement).filter(RoomAbonnement.room_id == r.id).delete()
        for abonnement_id in data.abonnements_requis_ids:
            db.add(RoomAbonnement(room_id=r.id, abonnement_id=abonnement_id))
    db.commit()
    db.refresh(r)
    return _serialise_room(r)


@router.delete("/{room_id}")
def supprimer_room(room_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    r = db.query(Room).filter(Room.id == room_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Room introuvable")
    db.delete(r)
    db.commit()
    return {"status": "ok"}
