"""
Découverte des worlds publics + profils utilisateurs publics.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from routers.auth import get_current_user
from models.world import World, Member
from models.user import User
from models.agent import AgentDefinition

router = APIRouter()


def _world_preview(w: World, db: Session) -> dict:
    member_count = db.query(Member).filter_by(world_id=w.id).count()
    agent_count  = db.query(AgentDefinition).filter_by(world_id=w.id, is_active=True).count()
    owner = db.query(User).filter_by(id=w.owner_id).first()
    import json as _json
    tags = []
    try:
        tags = _json.loads(w.tags) if w.tags else []
    except Exception:
        pass
    return {
        "id": w.id, "nom": w.nom, "description": w.description,
        "emoji": w.emoji, "couleur": w.couleur,
        "owner_id": w.owner_id,
        "owner_nom": owner.nom if owner else "?",
        "owner_avatar": owner.avatar_emoji if owner else "👤",
        "member_count": member_count,
        "agent_count": agent_count,
        "view_count": w.view_count or 0,
        "tags": tags,
        "created_at": w.created_at.isoformat() if w.created_at else None,
    }


# ── Worlds publics ───────────────────────────────────────────────

@router.get("/worlds")
def list_public_worlds(
    q: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    query = db.query(World).filter(World.is_public == True, World.is_garden == False)

    if q:
        query = query.filter(
            World.nom.ilike(f"%{q}%") | World.description.ilike(f"%{q}%")
        )
    if tag:
        query = query.filter(World.tags.ilike(f'%"{tag}"%'))

    worlds = query.order_by(World.view_count.desc(), World.created_at.desc()).offset(offset).limit(limit).all()
    return [_world_preview(w, db) for w in worlds]


@router.get("/worlds/{world_id}")
def get_public_world(world_id: str, db: Session = Depends(get_db)):
    w = db.query(World).filter_by(id=world_id, is_public=True).first()
    if not w:
        raise HTTPException(404, "World introuvable ou privé")
    # Incrémenter view_count
    w.view_count = (w.view_count or 0) + 1
    db.commit()
    return _world_preview(w, db)


@router.patch("/worlds/{world_id}/visibility")
def toggle_world_visibility(
    world_id: str,
    is_public: bool,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    w = db.query(World).filter_by(id=world_id, owner_id=user["id"]).first()
    if not w:
        raise HTTPException(404)
    if w.is_garden:
        raise HTTPException(403, "Le jardin secret est toujours privé")
    w.is_public = is_public
    db.commit()
    return {"id": w.id, "is_public": w.is_public}


class UpdateWorldMeta(BaseModel):
    tags: Optional[list[str]] = None
    map_data: Optional[str] = None


@router.patch("/worlds/{world_id}/meta")
def update_world_meta(
    world_id: str,
    body: UpdateWorldMeta,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    import json as _json
    w = db.query(World).filter_by(id=world_id, owner_id=user["id"]).first()
    if not w:
        raise HTTPException(404)
    if body.tags is not None:
        w.tags = _json.dumps(body.tags)
    if body.map_data is not None:
        w.map_data = body.map_data
    db.commit()
    return {"ok": True}


# ── Profils publics ──────────────────────────────────────────────

@router.get("/profile/{user_id}")
def get_public_profile(user_id: str, db: Session = Depends(get_db)):
    u = db.query(User).filter_by(id=user_id, is_public=True).first()
    if not u:
        raise HTTPException(404, "Profil introuvable ou privé")

    worlds = db.query(World).filter_by(owner_id=user_id, is_public=True).all()
    return {
        "id": u.id, "nom": u.nom,
        "avatar_emoji": u.avatar_emoji,
        "bio": u.bio or "",
        "website": u.website or "",
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "worlds": [_world_preview(w, db) for w in worlds],
    }


@router.patch("/profile/me")
def update_my_profile(
    bio: Optional[str] = None,
    website: Optional[str] = None,
    is_public: Optional[bool] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    u = db.query(User).filter_by(id=user["id"]).first()
    if not u:
        raise HTTPException(404)
    if bio is not None:
        u.bio = bio
    if website is not None:
        u.website = website
    if is_public is not None:
        u.is_public = is_public
    db.commit()
    return {
        "id": u.id, "nom": u.nom, "avatar_emoji": u.avatar_emoji,
        "bio": u.bio, "website": u.website, "is_public": u.is_public,
    }
