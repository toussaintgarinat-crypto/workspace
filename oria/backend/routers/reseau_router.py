"""
Router Intercommunalité — Documents partagés entre worlds en réseau.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from routers.auth import get_current_user
from models.world import Member

router = APIRouter()


def _is_member(db: Session, world_id: str, user_id: str) -> bool:
    return bool(db.query(Member).filter_by(world_id=world_id, user_id=user_id).first())


@router.get("/documents")
def documents_reseau(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_member(db, world_id, user["id"]):
        raise HTTPException(403)
    return {"communes": [], "deliberations": [], "arretes": []}
