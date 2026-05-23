"""LiteLLM gateway admin endpoints (models + keys)."""

from fastapi import APIRouter, Depends

from auth import require_admin
from models.schemas import GatewayKeyBody, GatewayModelBody
from services.gateway_service import gw_request

router = APIRouter(prefix="/gateway", tags=["gateway"])


@router.get("/models")
async def gateway_list_models(_: dict = Depends(require_admin)):
    return await gw_request("GET", "/model/info")


@router.post("/models")
async def gateway_add_model(body: GatewayModelBody, _: dict = Depends(require_admin)):
    return await gw_request("POST", "/model/new", body.model_dump())


@router.delete("/models/{model_id}")
async def gateway_delete_model(model_id: str, _: dict = Depends(require_admin)):
    return await gw_request("POST", "/model/delete", {"id": model_id})


@router.get("/keys")
async def gateway_list_keys(_: dict = Depends(require_admin)):
    return await gw_request("GET", "/key/list")


@router.post("/keys")
async def gateway_add_key(body: GatewayKeyBody, _: dict = Depends(require_admin)):
    return await gw_request("POST", "/key/generate", body.model_dump())


@router.delete("/keys/{key}")
async def gateway_delete_key(key: str, _: dict = Depends(require_admin)):
    return await gw_request("POST", "/key/delete", {"keys": [key]})
