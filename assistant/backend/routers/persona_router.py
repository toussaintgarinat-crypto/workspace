"""Persona settings (S66) + assistant personalities CRUD (S105b)."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import get_connections
from models.schemas import PersonaBody
import persona as persona_mod

router = APIRouter(tags=["persona"])


class PersonalityBody(BaseModel):
    label: str
    emoji: str = "🤖"
    description: str = ""
    system_prompt: str = ""


class ReorderBody(BaseModel):
    keys: list[str]


# ── Personnalités ─────────────────────────────────────────────────────────────

@router.get("/personalities")
async def list_personalities():
    return await persona_mod.get_personalities()


@router.post("/personalities")
async def create_personality(body: PersonalityBody, _user: dict = Depends(get_current_user)):
    return await persona_mod.create_personality(
        label=body.label,
        emoji=body.emoji,
        description=body.description,
        system_prompt=body.system_prompt,
    )


@router.put("/personalities/{key}")
async def update_personality(key: str, body: PersonalityBody, _user: dict = Depends(get_current_user)):
    try:
        return await persona_mod.update_personality(
            key=key,
            label=body.label,
            emoji=body.emoji,
            description=body.description,
            system_prompt=body.system_prompt,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/personalities/reorder")
async def reorder_personalities(body: ReorderBody, _user: dict = Depends(get_current_user)):
    await persona_mod.reorder_personalities(body.keys)
    return {"ok": True}


@router.delete("/personalities/{key}")
async def delete_personality(key: str, _user: dict = Depends(get_current_user)):
    try:
        await persona_mod.delete_personality(key)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Profil utilisateur ────────────────────────────────────────────────────────

@router.get("/persona")
async def get_persona_endpoint(user: dict = Depends(get_current_user)):
    return await persona_mod.get_persona(user.get("sub", "anonymous"))


@router.post("/persona")
async def save_persona_endpoint(
    body: PersonaBody, user: dict = Depends(get_current_user)
):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    persona = await persona_mod.upsert_persona(
        user.get("sub", "anonymous"), **fields
    )
    connections = await get_connections()
    active = [c for c in connections if c.get("enabled")]
    asyncio.create_task(persona_mod.sync_to_mempalace(persona, active))
    return persona
