"""
Conductor — Agents résidents pôle (Finance / Marketing / Sales / Ops / Legal)
connectés à Forge via API REST.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.resident_agent import ResidentAgent
from routers.auth import get_current_user
from services.conductor_ws import conductor_manager

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────

def _agent_dict(a: ResidentAgent) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "pole_type": a.pole_type,
        "avatar_emoji": a.avatar_emoji,
        "description": a.description,
        "room_id": a.room_id,
        "forge_url": a.forge_url,
        "status": a.status,
        "current_task": a.current_task or "",
        "last_activity": a.last_activity.isoformat() if a.last_activity else None,
    }


async def _call_forge_background(
    agent_id: str,
    forge_url: str,
    forge_token: str,
    message: str,
    system_override: str,
):
    """Appelle Forge en arrière-plan et met à jour le statut de l'agent."""
    from database import SessionLocal

    db = SessionLocal()
    try:
        headers = {"Authorization": f"Bearer {forge_token}"} if forge_token else {}
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(
                f"{forge_url.rstrip('/')}/api/agents/react",
                json={
                    "message": message,
                    "sessionId": f"conductor-{agent_id}",
                    "systemOverride": system_override,
                },
                headers=headers,
            )
            answer = ""
            if r.status_code == 200:
                data = r.json()
                answer = data.get("answer", "")
            new_status = "idle"
    except Exception as e:
        answer = str(e)[:200]
        new_status = "error"

    agent = db.query(ResidentAgent).filter_by(id=agent_id).first()
    if agent:
        agent.status = new_status
        agent.current_task = answer[:300] if new_status == "error" else ""
        agent.last_activity = datetime.now(timezone.utc)
        db.commit()
        await conductor_manager.broadcast({"type": "status", "agent": _agent_dict(agent)})
    db.close()


# ── CRUD ─────────────────────────────────────────────────────────

class CreateResident(BaseModel):
    name: str
    pole_type: str
    avatar_emoji: str = "🤖"
    description: str = ""
    room_id: Optional[str] = None
    forge_url: str = "http://localhost:3001"
    forge_token: str = ""


class UpdateResident(BaseModel):
    name: Optional[str] = None
    avatar_emoji: Optional[str] = None
    description: Optional[str] = None
    room_id: Optional[str] = None
    forge_url: Optional[str] = None
    forge_token: Optional[str] = None
    status: Optional[str] = None


@router.get("/agents")
def list_residents(db: Session = Depends(get_db), user=Depends(get_current_user)):
    agents = db.query(ResidentAgent).order_by(ResidentAgent.pole_type).all()
    return [_agent_dict(a) for a in agents]


@router.post("/agents")
def create_resident(body: CreateResident, db: Session = Depends(get_db), user=Depends(get_current_user)):
    agent = ResidentAgent(**body.model_dump())
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return _agent_dict(agent)


@router.patch("/agents/{agent_id}")
def update_resident(agent_id: str, body: UpdateResident, db: Session = Depends(get_db), user=Depends(get_current_user)):
    agent = db.query(ResidentAgent).filter_by(id=agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent introuvable")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(agent, k, v)
    agent.last_activity = datetime.now(timezone.utc)
    db.commit()
    db.refresh(agent)
    return _agent_dict(agent)


@router.delete("/agents/{agent_id}", status_code=204)
def delete_resident(agent_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    agent = db.query(ResidentAgent).filter_by(id=agent_id).first()
    if not agent:
        raise HTTPException(404)
    db.delete(agent)
    db.commit()


# ── Appel d'un agent ─────────────────────────────────────────────

class CallBody(BaseModel):
    message: str
    context: str = ""


@router.post("/agents/{agent_id}/call")
async def call_agent(
    agent_id: str,
    body: CallBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    agent = db.query(ResidentAgent).filter_by(id=agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent introuvable")

    agent.status = "working"
    agent.current_task = body.message[:200]
    agent.last_activity = datetime.now(timezone.utc)
    db.commit()

    await conductor_manager.broadcast({"type": "status", "agent": _agent_dict(agent)})

    system_override = (
        f"Tu es l'agent pôle {agent.pole_type} de l'équipe. {agent.description}\n{body.context}"
    ).strip()

    background_tasks.add_task(
        _call_forge_background,
        agent.id, agent.forge_url, agent.forge_token,
        body.message, system_override,
    )

    return {"status": "working", "agent_id": agent_id}


@router.get("/agents/{agent_id}/status")
def agent_status(agent_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    agent = db.query(ResidentAgent).filter_by(id=agent_id).first()
    if not agent:
        raise HTTPException(404)
    return _agent_dict(agent)


# ── Webhook Forge → Oria ─────────────────────────────────────────

class ForgeWebhook(BaseModel):
    pole_type: str
    status: str         # idle / working / error
    task_description: str = ""


@router.post("/webhooks/forge")
async def forge_webhook(body: ForgeWebhook, db: Session = Depends(get_db)):
    """Forge notifie Oria d'un changement de statut d'un agent pôle."""
    agent = db.query(ResidentAgent).filter_by(pole_type=body.pole_type).first()
    if not agent:
        raise HTTPException(404, f"Agent pôle '{body.pole_type}' introuvable")
    agent.status = body.status
    agent.current_task = body.task_description[:300]
    agent.last_activity = datetime.now(timezone.utc)
    db.commit()
    await conductor_manager.broadcast({"type": "status", "agent": _agent_dict(agent)})
    return {"ok": True}
