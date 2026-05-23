"""WebPush VAPID public key + subscription management."""

from fastapi import APIRouter, HTTPException

from models.schemas import PushSubscribeBody, PushUnsubscribeBody
import push as push_mod

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key")
async def push_vapid_key():
    key = await push_mod.get_public_key()
    if not key:
        raise HTTPException(status_code=503, detail="WebPush not available")
    return {"public_key": key}


@router.post("/subscribe")
async def push_subscribe(body: PushSubscribeBody):
    await push_mod.save_subscription(body.endpoint, body.p256dh, body.auth)
    return {"subscribed": True}


@router.post("/unsubscribe")
async def push_unsubscribe(body: PushUnsubscribeBody):
    await push_mod.delete_subscription(body.endpoint)
    return {"unsubscribed": True}
