from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.quartier import Quartier
from routers.auth import get_current_user
import uuid

router = APIRouter()

class CreerQuartier(BaseModel):
    world_id:    str
    nom:         str
    emoji:       str = "🏘"
    couleur:     str = "#5865F2"
    description: str = ""

class UpdateQuartier(BaseModel):
    nom:         str = ""
    emoji:       str = ""
    couleur:     str = ""
    description: str = ""

@router.post("/")
def creer_quartier(data: CreerQuartier, db: Session = Depends(get_db), user=Depends(get_current_user)):
    quartier = Quartier(
        id=str(uuid.uuid4()),
        world_id=data.world_id,
        nom=data.nom, emoji=data.emoji,
        couleur=data.couleur, description=data.description,
    )
    db.add(quartier)
    db.commit()
    db.refresh(quartier)
    return {"id": quartier.id, "nom": quartier.nom, "emoji": quartier.emoji,
            "couleur": quartier.couleur, "description": quartier.description, "buildings": []}

@router.patch("/{quartier_id}")
def modifier_quartier(quartier_id: str, data: UpdateQuartier, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Quartier).filter(Quartier.id == quartier_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quartier introuvable")
    if data.nom:                     q.nom         = data.nom
    if data.emoji:                   q.emoji       = data.emoji
    if data.couleur:                 q.couleur     = data.couleur
    if data.description is not None: q.description = data.description
    db.commit()
    db.refresh(q)
    return {"id": q.id, "nom": q.nom, "emoji": q.emoji, "couleur": q.couleur, "description": q.description}

@router.delete("/{quartier_id}")
def supprimer_quartier(quartier_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Quartier).filter(Quartier.id == quartier_id).first()
    if q:
        for b in q.buildings:
            b.quartier_id = None
        db.delete(q)
        db.commit()
    return {"status": "ok"}
