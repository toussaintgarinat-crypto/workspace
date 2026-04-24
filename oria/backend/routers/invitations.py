from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.world import World, Member, Invitation
from routers.auth import get_current_user

router = APIRouter()

class CreerInvitation(BaseModel):
    world_id: str
    max_uses: int = 0

@router.post("/")
def creer_invitation(data: CreerInvitation, db: Session = Depends(get_db), user=Depends(get_current_user)):
    inv = Invitation(world_id=data.world_id, created_by=user["id"], max_uses=data.max_uses)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {"token": inv.token, "world_id": inv.world_id}

@router.get("/{token}")
def get_invitation(token: str, db: Session = Depends(get_db)):
    inv = db.query(Invitation).filter(Invitation.token == token).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation invalide")
    if inv.max_uses > 0 and inv.uses >= inv.max_uses:
        raise HTTPException(status_code=400, detail="Invitation épuisée")
    world = db.query(World).filter(World.id == inv.world_id).first()
    return {"token": token, "world_id": inv.world_id,
            "world_nom": world.nom if world else "?",
            "world_emoji": world.emoji if world else "🌍",
            "uses": inv.uses, "max_uses": inv.max_uses}

@router.post("/{token}/rejoindre")
def rejoindre_via_invitation(token: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    inv = db.query(Invitation).filter(Invitation.token == token).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation invalide")
    if inv.max_uses > 0 and inv.uses >= inv.max_uses:
        raise HTTPException(status_code=400, detail="Invitation épuisée")
    existant = db.query(Member).filter(Member.world_id == inv.world_id, Member.user_id == user["id"]).first()
    if not existant:
        db.add(Member(world_id=inv.world_id, user_id=user["id"],
                      nom=user["nom"], avatar_emoji=user["avatar_emoji"], role="membre"))
        inv.uses += 1
        db.commit()
    world = db.query(World).filter(World.id == inv.world_id).first()
    return {"world_id": inv.world_id, "world_nom": world.nom, "world_emoji": world.emoji}

@router.get("/world/{world_id}")
def lister_invitations(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    invs = db.query(Invitation).filter(Invitation.world_id == world_id).all()
    return [{"token": i.token, "uses": i.uses, "max_uses": i.max_uses} for i in invs]

@router.delete("/{token}")
def supprimer_invitation(token: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    inv = db.query(Invitation).filter(Invitation.token == token).first()
    if inv:
        db.delete(inv)
        db.commit()
    return {"status": "ok"}
