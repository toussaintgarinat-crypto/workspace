"""Scheduled prompts CRUD (S69 — APScheduler)."""

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from models.schemas import ScheduledBody, ScheduledUpdateBody
import scheduled as scheduled_mod

router = APIRouter(prefix="/scheduled", tags=["scheduled"])


@router.get("")
async def scheduled_list(_: dict = Depends(get_current_user)):
    return await scheduled_mod.list_scheduled()


@router.post("", status_code=201)
async def scheduled_create(
    body: ScheduledBody, _: dict = Depends(get_current_user)
):
    return await scheduled_mod.create_scheduled(body.title, body.prompt, body.schedule)


@router.get("/{prompt_id}")
async def scheduled_get(prompt_id: str, _: dict = Depends(get_current_user)):
    row = await scheduled_mod.get_scheduled(prompt_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.patch("/{prompt_id}")
async def scheduled_update(
    prompt_id: str,
    body: ScheduledUpdateBody,
    _: dict = Depends(get_current_user),
):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    row = await scheduled_mod.update_scheduled(prompt_id, **fields)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.delete("/{prompt_id}")
async def scheduled_delete(
    prompt_id: str, _: dict = Depends(get_current_user)
):
    await scheduled_mod.delete_scheduled(prompt_id)
    return {"deleted": prompt_id}


@router.post("/{prompt_id}/run")
async def scheduled_run_now(
    prompt_id: str, _: dict = Depends(get_current_user)
):
    return await scheduled_mod.run_now(prompt_id)
