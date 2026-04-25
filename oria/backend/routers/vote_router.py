"""
Votes en temps réel lors des séances de conseil municipal.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from database import get_db
from routers.auth import get_current_user
from models.vote import Vote, Bulletin
from models.world import Member

router = APIRouter()


def _is_admin(db, world_id, user_id):
    m = db.query(Member).filter_by(world_id=world_id, user_id=user_id).first()
    return m and m.role in ("proprietaire", "admin")


class VoteIn(BaseModel):
    conseil_id: str
    world_id: str
    question: str


@router.post("/")
def creer_vote(body: VoteIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_admin(db, body.world_id, user["id"]):
        raise HTTPException(403, "Réservé aux admins")
    v = Vote(conseil_id=body.conseil_id, world_id=body.world_id,
             question=body.question, created_by=user["id"])
    db.add(v); db.commit(); db.refresh(v)
    return _vote_dict(v, [])


@router.get("/conseil/{conseil_id}")
def lister_votes(conseil_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    votes = db.query(Vote).filter_by(conseil_id=conseil_id).order_by(Vote.created_at).all()
    return [_vote_dict(v, v.bulletins) for v in votes]


@router.post("/{vote_id}/voter")
def voter(vote_id: str, choix: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    v = db.query(Vote).get(vote_id)
    if not v: raise HTTPException(404)
    if v.statut != "ouvert": raise HTTPException(400, "Vote fermé")
    existing = db.query(Bulletin).filter_by(vote_id=vote_id, user_id=user["id"]).first()
    if existing:
        existing.choix = choix
    else:
        db.add(Bulletin(vote_id=vote_id, user_id=user["id"], user_nom=user["nom"], choix=choix))
    db.commit()
    db.refresh(v)
    return _vote_dict(v, v.bulletins)


@router.patch("/{vote_id}/fermer")
def fermer_vote(vote_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    v = db.query(Vote).get(vote_id)
    if not v: raise HTTPException(404)
    if not _is_admin(db, v.world_id, user["id"]): raise HTTPException(403)
    v.statut = "ferme"
    v.ferme_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(v)
    return _vote_dict(v, v.bulletins)


@router.delete("/{vote_id}")
def supprimer_vote(vote_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    v = db.query(Vote).get(vote_id)
    if not v: raise HTTPException(404)
    if not _is_admin(db, v.world_id, user["id"]): raise HTTPException(403)
    db.delete(v); db.commit()
    return {"ok": True}


def _vote_dict(v, bulletins):
    resultats = {"pour": 0, "contre": 0, "abstention": 0}
    for b in bulletins:
        if b.choix in resultats:
            resultats[b.choix] += 1
    total = sum(resultats.values())
    mon_vote = None
    return {
        "id": v.id, "conseil_id": v.conseil_id, "world_id": v.world_id,
        "question": v.question, "statut": v.statut,
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "ferme_at": v.ferme_at.isoformat() if v.ferme_at else None,
        "resultats": resultats, "total_votants": total,
        "bulletins": [{"user_nom": b.user_nom, "choix": b.choix} for b in bulletins],
    }
