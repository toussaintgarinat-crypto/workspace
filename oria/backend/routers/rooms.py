from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.building import Room

router = APIRouter()

@router.get("/{room_id}")
def get_room(room_id: str, db: Session = Depends(get_db)):
    r = db.query(Room).filter(Room.id == room_id).first()
    if not r:
        return {"erreur": "Room introuvable"}
    return {"id": r.id, "nom": r.nom, "type": r.type, "etage": r.etage, "emoji": r.emoji, "building_id": r.building_id}
