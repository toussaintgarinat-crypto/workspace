"""Persona settings (S66) + assistant personalities (S105)."""

import asyncio

from fastapi import APIRouter, Depends

from auth import get_current_user
from db import get_connections
from models.schemas import PersonaBody
import persona as persona_mod

router = APIRouter(tags=["persona"])


@router.get("/personalities")
async def list_personalities():
    return persona_mod.get_personalities()


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
