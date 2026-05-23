"""Legacy global connections table (used when AUTH_ENABLED=false)."""

from fastapi import APIRouter, Depends

from auth import get_current_user
from db import get_connections, upsert_connection, delete_connection
from models.schemas import ConnectionBody

router = APIRouter(tags=["connections"])


@router.get("/connections")
async def list_connections(_: dict = Depends(get_current_user)):
    return await get_connections()


@router.post("/connections")
async def create_connection(body: ConnectionBody, _: dict = Depends(get_current_user)):
    return await upsert_connection(
        id=body.id,
        name=body.name,
        url=body.url,
        token=body.token,
        app_type=body.app_type,
        enabled=body.enabled,
    )


@router.delete("/connections/{connection_id}")
async def remove_connection(connection_id: str, _: dict = Depends(get_current_user)):
    await delete_connection(connection_id)
    return {"deleted": connection_id}
