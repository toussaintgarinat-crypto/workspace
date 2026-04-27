from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import uuid

from database import get_db
from models.shared_zone import SharedZone, SharedZoneMember, ZoneScope, ZoneRole
from models.user import User
from routers.auth import get_current_user

router = APIRouter()


class CreateZoneBody(BaseModel):
    name:                str
    scope:               ZoneScope = ZoneScope.user
    world_id:            Optional[str] = None
    mempalace_namespace: Optional[str] = None


class InviteMemberBody(BaseModel):
    user_id: str
    role:    ZoneRole = ZoneRole.reader


def _zone_dict(zone: SharedZone) -> dict:
    return {
        "id":                  zone.id,
        "name":                zone.name,
        "owner_id":            zone.owner_id,
        "scope":               zone.scope,
        "world_id":            zone.world_id,
        "mempalace_namespace": zone.mempalace_namespace,
        "created_at":          zone.created_at.isoformat(),
    }


def _require_access(zone_id: str, user_id: str, db: Session) -> SharedZone:
    zone = db.query(SharedZone).filter(SharedZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    member = db.query(SharedZoneMember).filter(
        SharedZoneMember.zone_id == zone_id,
        SharedZoneMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    return zone


@router.post("/", status_code=201)
def create_zone(
    body: CreateZoneBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    namespace = body.mempalace_namespace or f"shared/{uuid.uuid4().hex[:8]}"
    zone = SharedZone(
        id=str(uuid.uuid4()),
        name=body.name,
        owner_id=current_user.id,
        scope=body.scope,
        world_id=body.world_id,
        mempalace_namespace=namespace,
    )
    db.add(zone)
    db.add(SharedZoneMember(zone_id=zone.id, user_id=current_user.id, role=ZoneRole.owner))
    db.commit()
    db.refresh(zone)
    return _zone_dict(zone)


@router.get("/")
def list_zones(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    memberships = (
        db.query(SharedZoneMember)
        .filter(SharedZoneMember.user_id == current_user.id)
        .all()
    )
    zone_ids = [m.zone_id for m in memberships]
    zones = db.query(SharedZone).filter(SharedZone.id.in_(zone_ids)).all()
    return [_zone_dict(z) for z in zones]


@router.get("/{zone_id}")
def get_zone(
    zone_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = _require_access(zone_id, current_user.id, db)
    return _zone_dict(zone)


@router.delete("/{zone_id}", status_code=204)
def delete_zone(
    zone_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = db.query(SharedZone).filter(SharedZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    if zone.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete a zone")
    db.query(SharedZoneMember).filter(SharedZoneMember.zone_id == zone_id).delete()
    db.delete(zone)
    db.commit()


@router.post("/{zone_id}/members", status_code=201)
def invite_member(
    zone_id: str,
    body: InviteMemberBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = db.query(SharedZone).filter(SharedZone.id == zone_id).first()
    if not zone or zone.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can invite members")
    if body.role == ZoneRole.owner:
        raise HTTPException(status_code=400, detail="Cannot assign owner role via invitation")
    existing = db.query(SharedZoneMember).filter(
        SharedZoneMember.zone_id == zone_id,
        SharedZoneMember.user_id == body.user_id,
    ).first()
    if existing:
        existing.role = body.role
    else:
        db.add(SharedZoneMember(zone_id=zone_id, user_id=body.user_id, role=body.role))
    db.commit()
    return {"ok": True}


@router.delete("/{zone_id}/members/{user_id}", status_code=204)
def remove_member(
    zone_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = db.query(SharedZone).filter(SharedZone.id == zone_id).first()
    if not zone or zone.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can remove members")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself as owner")
    db.query(SharedZoneMember).filter(
        SharedZoneMember.zone_id == zone_id,
        SharedZoneMember.user_id == user_id,
    ).delete()
    db.commit()


@router.get("/{zone_id}/members")
def list_members(
    zone_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_access(zone_id, current_user.id, db)
    members = (
        db.query(SharedZoneMember)
        .filter(SharedZoneMember.zone_id == zone_id)
        .all()
    )
    return [
        {"user_id": m.user_id, "role": m.role, "joined_at": m.joined_at.isoformat()}
        for m in members
    ]
