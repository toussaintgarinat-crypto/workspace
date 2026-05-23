"""MemPalace proxy endpoints (wings, search, drawers, export, import)."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from auth import get_current_user
from models.schemas import (
    MempalaceDrawerBody,
    MempalaceImportBody,
    MempalaceSearchBody,
)
from services.mempalace_service import mp_get, mp_post

router = APIRouter(prefix="/mempalace", tags=["mempalace"])


@router.get("/wings")
async def mempalace_wings(user: dict = Depends(get_current_user)):
    r = await mp_get(user, "/api/wings")
    return r.json()


@router.post("/search")
async def mempalace_search(
    body: MempalaceSearchBody, user: dict = Depends(get_current_user)
):
    payload = {"query": body.query, "n_results": body.n_results}
    if body.wing:
        payload["wing"] = body.wing
    r = await mp_post(user, "/api/search", payload, timeout=15)
    return r.json()


@router.get("/entries/{wing}")
async def mempalace_entries(
    wing: str, limit: int = 50, user: dict = Depends(get_current_user)
):
    r = await mp_get(user, f"/api/wings/{wing}/drawers", params={"limit": limit})
    return r.json()


@router.post("/drawers", status_code=201)
async def mempalace_add_drawer(
    body: MempalaceDrawerBody, user: dict = Depends(get_current_user)
):
    r = await mp_post(
        user,
        "/api/drawers",
        {
            "content": body.content,
            "wing": body.wing,
            "room": body.room,
            "metadata": body.metadata or {},
        },
        timeout=15,
    )
    return r.json()


@router.get("/export")
async def mempalace_export(
    format: str = "json", user: dict = Depends(get_current_user)
):
    r = await mp_get(user, "/api/export", params={"format": format}, timeout=30)
    media_type = "text/markdown" if format == "markdown" else "application/json"
    filename = f"mempalace_export.{'md' if format == 'markdown' else 'json'}"
    return StreamingResponse(
        iter([r.content]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def mempalace_import(
    body: MempalaceImportBody, user: dict = Depends(get_current_user)
):
    r = await mp_post(user, "/api/import", {"entries": body.entries}, timeout=60)
    return r.json()
