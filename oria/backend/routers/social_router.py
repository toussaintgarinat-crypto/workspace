"""
Réseau social : follow/unfollow, fil d'activité, notifications.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from routers.auth import get_current_user, _get_jwks, KEYCLOAK_CLIENT_ID
from models.social import UserFollow, Notification
from models.user import User
from models.world import World
from sse_starlette.sse import EventSourceResponse
from jose import jwt, JWTError
import asyncio, json, uuid, os

router = APIRouter()

_NOTIF_CHANNEL = "notifs:{user_id}"


async def _publish_notif(user_id: str, count: int):
    from redis_client import redis_client
    if redis_client:
        await redis_client.publish(_NOTIF_CHANNEL.format(user_id=user_id), json.dumps({"count": count}))


# ── Follow ───────────────────────────────────────────────────────

@router.post("/follow/{user_id}")
async def follow_user(user_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user_id == user["id"]:
        raise HTTPException(400, "Tu ne peux pas te suivre toi-même")
    if db.query(UserFollow).filter_by(follower_id=user["id"], followed_id=user_id).first():
        raise HTTPException(400, "Déjà suivi")
    target = db.query(User).filter_by(id=user_id).first()
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    db.add(UserFollow(follower_id=user["id"], followed_id=user_id))
    db.add(Notification(
        user_id=user_id,
        type="new_follower",
        data=json.dumps({
            "follower_id":     user["id"],
            "follower_nom":    user["nom"],
            "follower_avatar": user["avatar_emoji"],
        }),
    ))
    db.commit()
    count = db.query(Notification).filter_by(user_id=user_id, read=False).count()
    await _publish_notif(user_id, count)
    return {"ok": True}


@router.delete("/follow/{user_id}")
def unfollow_user(user_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    follow = db.query(UserFollow).filter_by(follower_id=user["id"], followed_id=user_id).first()
    if not follow:
        raise HTTPException(404, "Pas suivi")
    db.delete(follow)
    db.commit()
    return {"ok": True}


@router.get("/check/{user_id}")
def check_follow(user_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    existing = db.query(UserFollow).filter_by(follower_id=user["id"], followed_id=user_id).first()
    return {"following": bool(existing)}


@router.get("/following")
def get_following(db: Session = Depends(get_db), user=Depends(get_current_user)):
    follows = db.query(UserFollow).filter_by(follower_id=user["id"]).all()
    ids = [f.followed_id for f in follows]
    users = db.query(User).filter(User.id.in_(ids)).all() if ids else []
    return [{"id": u.id, "nom": u.nom, "avatar_emoji": u.avatar_emoji, "bio": u.bio or ""} for u in users]


@router.get("/followers")
def get_followers(db: Session = Depends(get_db), user=Depends(get_current_user)):
    follows = db.query(UserFollow).filter_by(followed_id=user["id"]).all()
    ids = [f.follower_id for f in follows]
    users = db.query(User).filter(User.id.in_(ids)).all() if ids else []
    return [{"id": u.id, "nom": u.nom, "avatar_emoji": u.avatar_emoji, "bio": u.bio or ""} for u in users]


# ── Feed ─────────────────────────────────────────────────────────

@router.get("/feed")
def get_feed(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Worlds publics récents des utilisateurs suivis."""
    follows = db.query(UserFollow).filter_by(follower_id=user["id"]).all()
    followed_ids = [f.followed_id for f in follows]
    if not followed_ids:
        return []

    worlds = (db.query(World)
              .filter(
                  World.owner_id.in_(followed_ids),
                  World.is_public == True,
                  World.is_garden == False,
              )
              .order_by(World.created_at.desc())
              .limit(30).all())

    result = []
    owners = {u.id: u for u in db.query(User).filter(User.id.in_(followed_ids)).all()}
    for w in worlds:
        owner = owners.get(w.owner_id)
        result.append({
            "type":          "world",
            "world_id":      w.id,
            "world_nom":     w.nom,
            "world_emoji":   w.emoji,
            "world_couleur": w.couleur,
            "world_desc":    w.description or "",
            "owner_id":      w.owner_id,
            "owner_nom":     owner.nom if owner else "?",
            "owner_avatar":  owner.avatar_emoji if owner else "👤",
            "created_at":    w.created_at.isoformat() if w.created_at else None,
        })
    return result


# ── Notifications ────────────────────────────────────────────────

@router.get("/notifs")
def get_notifs(db: Session = Depends(get_db), user=Depends(get_current_user)):
    notifs = (db.query(Notification)
              .filter_by(user_id=user["id"])
              .order_by(Notification.created_at.desc())
              .limit(50).all())
    return [
        {
            "id":         n.id,
            "type":       n.type,
            "data":       json.loads(n.data or "{}"),
            "read":       n.read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifs
    ]


@router.get("/notifs/unread-count")
def unread_count(db: Session = Depends(get_db), user=Depends(get_current_user)):
    count = db.query(Notification).filter_by(user_id=user["id"], read=False).count()
    return {"count": count}


@router.get("/notifs/stream")
async def notifs_stream(request: Request, token: str = "", db: Session = Depends(get_db)):
    # Valide le JWT depuis le query param (EventSource ne supporte pas les headers)
    if not token:
        raise HTTPException(401, "Token manquant")
    try:
        jwks = _get_jwks()
        payload = jwt.decode(token, jwks, algorithms=["RS256"],
                             options={"verify_at_hash": False, "audience": KEYCLOAK_CLIENT_ID})
    except JWTError as exc:
        raise HTTPException(401, f"Token invalide: {exc}")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Token invalide (sub manquant)")

    from redis_client import redis_client

    async def generator():
        # Envoie le count actuel au démarrage
        count = db.query(Notification).filter_by(user_id=user_id, read=False).count()
        yield json.dumps({"count": count})

        if redis_client:
            channel = _NOTIF_CHANNEL.format(user_id=user_id)
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(channel)
            try:
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        msg = await asyncio.wait_for(pubsub.get_message(ignore_subscribe_messages=True), timeout=25)
                        if msg and msg.get("type") == "message":
                            yield msg["data"]
                        else:
                            yield json.dumps({"type": "ping"})
                    except asyncio.TimeoutError:
                        yield json.dumps({"type": "ping"})
            finally:
                await pubsub.unsubscribe(channel)
                await pubsub.aclose()
        else:
            # Fallback sans Redis : polling toutes les 30s
            while True:
                if await request.is_disconnected():
                    break
                await asyncio.sleep(30)
                count = db.query(Notification).filter_by(user_id=user_id, read=False).count()
                yield json.dumps({"count": count})

    return EventSourceResponse(generator())


@router.patch("/notifs/{notif_id}/read")
def mark_read(notif_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    n = db.query(Notification).filter_by(id=notif_id, user_id=user["id"]).first()
    if not n:
        raise HTTPException(404)
    n.read = True
    db.commit()
    return {"ok": True}


@router.patch("/notifs/read-all")
def mark_all_read(db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.query(Notification).filter_by(user_id=user["id"], read=False).update({"read": True})
    db.commit()
    return {"ok": True}


# ── Public profile ───────────────────────────────────────────────

@router.get("/profile/{user_id}")
def get_profile(user_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    target = db.query(User).filter_by(id=user_id).first()
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    worlds = (db.query(World)
              .filter_by(owner_id=user_id, is_public=True, is_garden=False)
              .order_by(World.created_at.desc())
              .limit(20).all())
    return {
        "id":           target.id,
        "nom":          target.nom,
        "avatar_emoji": target.avatar_emoji,
        "bio":          target.bio or "",
        "worlds": [
            {
                "id":          w.id,
                "nom":         w.nom,
                "emoji":       w.emoji,
                "couleur":     w.couleur,
                "description": w.description or "",
            }
            for w in worlds
        ],
    }
