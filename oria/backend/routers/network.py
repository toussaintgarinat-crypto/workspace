from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models.network import WorldLink
from models.world import World, Member
from routers.auth import get_current_user
import uuid

router = APIRouter()

TYPES_VALIDES = {"filiale", "partenaire", "client", "fournisseur", "association"}

class CreerLien(BaseModel):
    from_world_id: str
    to_world_id:   str
    type:          str = "partenaire"
    pourcentage:   Optional[float] = None
    visible:       str = "reseau"   # reseau | prive

@router.post("/")
def creer_lien(data: CreerLien, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if data.type not in TYPES_VALIDES:
        raise HTTPException(status_code=400, detail=f"Type invalide. Valeurs: {TYPES_VALIDES}")
    if data.from_world_id == data.to_world_id:
        raise HTTPException(status_code=400, detail="Un monde ne peut pas se lier à lui-même")
    # Vérifier que l'utilisateur est membre du monde source
    m = db.query(Member).filter(Member.world_id == data.from_world_id, Member.user_id == user["id"]).first()
    if not m:
        raise HTTPException(status_code=403, detail="Tu n'es pas membre de ce monde")
    lien = WorldLink(id=str(uuid.uuid4()), from_world_id=data.from_world_id,
                     to_world_id=data.to_world_id, type=data.type,
                     pourcentage=data.pourcentage, created_by=user["id"], visible=data.visible)
    db.add(lien)
    db.commit()
    db.refresh(lien)
    return _serialise(lien)

@router.get("/{world_id}")
def get_reseau(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Retourne tous les liens d'un monde + les mondes accessibles par le user."""
    liens_out = db.query(WorldLink).filter(WorldLink.from_world_id == world_id).all()
    liens_in  = db.query(WorldLink).filter(WorldLink.to_world_id == world_id).all()

    # Mondes où l'user est membre (pour savoir ce qui est accessible)
    mes_worlds = {m.world_id for m in db.query(Member).filter(Member.user_id == user["id"]).all()}

    noeuds = {}
    aretes = []

    def ajouter_noeud(world_id):
        if world_id in noeuds:
            return
        w = db.query(World).filter(World.id == world_id).first()
        if w:
            noeuds[w.id] = {
                "id": w.id, "nom": w.nom, "emoji": w.emoji,
                "couleur": w.couleur, "accessible": w.id in mes_worlds,
            }

    ajouter_noeud(world_id)
    for l in liens_out + liens_in:
        ajouter_noeud(l.from_world_id)
        ajouter_noeud(l.to_world_id)
        aretes.append(_serialise(l))

    return {"noeuds": list(noeuds.values()), "aretes": aretes}

@router.get("/global/moi")
def get_mon_reseau(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Retourne le graphe complet de tous les mondes de l'utilisateur et leurs liens."""
    mes_worlds = [m.world_id for m in db.query(Member).filter(Member.user_id == user["id"]).all()]
    noeuds = {}
    aretes_vus = set()
    aretes = []

    for wid in mes_worlds:
        w = db.query(World).filter(World.id == wid).first()
        if w:
            noeuds[w.id] = {"id": w.id, "nom": w.nom, "emoji": w.emoji,
                            "couleur": w.couleur, "accessible": True}
        liens = db.query(WorldLink).filter(
            (WorldLink.from_world_id == wid) | (WorldLink.to_world_id == wid)
        ).all()
        for l in liens:
            if l.id not in aretes_vus:
                aretes_vus.add(l.id)
                aretes.append(_serialise(l))
            for other_id in [l.from_world_id, l.to_world_id]:
                if other_id not in noeuds:
                    ow = db.query(World).filter(World.id == other_id).first()
                    if ow:
                        noeuds[ow.id] = {"id": ow.id, "nom": ow.nom, "emoji": ow.emoji,
                                         "couleur": ow.couleur, "accessible": ow.id in mes_worlds}

    return {"noeuds": list(noeuds.values()), "aretes": aretes}

@router.delete("/{lien_id}")
def supprimer_lien(lien_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    l = db.query(WorldLink).filter(WorldLink.id == lien_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Lien introuvable")
    if l.created_by != user["id"]:
        raise HTTPException(status_code=403, detail="Seul le créateur peut supprimer ce lien")
    db.delete(l)
    db.commit()
    return {"status": "ok"}

def _serialise(l: WorldLink):
    return {"id": l.id, "from_world_id": l.from_world_id, "to_world_id": l.to_world_id,
            "type": l.type, "pourcentage": l.pourcentage, "visible": l.visible,
            "created_by": l.created_by}
