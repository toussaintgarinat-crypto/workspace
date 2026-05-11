from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File as FastAPIFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models.building import Room
from models.coin import RoomAccesPaye, Coin, CoinDossier, CoinFichier
from routers.auth import get_current_user
import uuid, os, shutil

# ── Stripe ────────────────────────────────────────────────────────────────────
STRIPE_ENABLED = False
stripe = None
STRIPE_WEBHOOK_SECRET = None
try:
    import stripe as _stripe
    _key = os.getenv("STRIPE_SECRET_KEY")
    if _key:
        _stripe.api_key = _key
        STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
        STRIPE_ENABLED = True
        stripe = _stripe
except ImportError:
    pass

# ── Upload dir ────────────────────────────────────────────────────────────────
for _candidate in ["/app/uploads", "/tmp/uploads",
                   os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))]:
    try:
        os.makedirs(_candidate, exist_ok=True)
        UPLOAD_DIR = _candidate
        break
    except OSError:
        continue
else:
    UPLOAD_DIR = "/tmp/uploads"

router = APIRouter()

# ── Schemas ───────────────────────────────────────────────────────────────────

class CreerCoin(BaseModel):
    titre:       str
    description: str = ""

class UpdateCoin(BaseModel):
    titre:       str = ""
    description: str = ""

class CreerDossier(BaseModel):
    nom:        str
    visibilite: str = "prive"   # prive | partage
    parent_id:  Optional[str] = None

class UpdateDossier(BaseModel):
    nom:        str = ""
    visibilite: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _has_access(room_id: str, user_id: str, db: Session) -> bool:
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room or not room.est_payante:
        return True
    return db.query(RoomAccesPaye).filter(
        RoomAccesPaye.room_id == room_id,
        RoomAccesPaye.user_id == user_id,
        RoomAccesPaye.actif == True,
    ).first() is not None

def _serialise_fichier(f: CoinFichier) -> dict:
    return {
        "id":          f.id,
        "nom":         f.nom,
        "taille":      f.taille,
        "type_mime":   f.type_mime,
        "uploaded_by": f.uploaded_by,
        "created_at":  f.created_at.isoformat() if f.created_at else None,
    }

def _serialise_dossier(d: CoinDossier) -> dict:
    return {
        "id":          d.id,
        "nom":         d.nom,
        "visibilite":  d.visibilite,
        "parent_id":   d.parent_id,
        "nb_fichiers": len(d.fichiers),
        "created_at":  d.created_at.isoformat() if d.created_at else None,
    }

def _serialise_coin(c: Coin, user_id: str) -> dict:
    return {
        "id":          c.id,
        "room_id":     c.room_id,
        "user_id":     c.user_id,
        "user_nom":    c.user_nom,
        "user_emoji":  c.user_emoji,
        "titre":       c.titre,
        "description": c.description,
        "est_mien":    c.user_id == user_id,
        "created_at":  c.created_at.isoformat() if c.created_at else None,
    }


# ── Accès payant ──────────────────────────────────────────────────────────────

@router.get("/rooms/{room_id}/acces-paye")
def check_acces(room_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room introuvable")
    if not room.est_payante:
        return {"acces": True, "gratuit": True}
    acces = db.query(RoomAccesPaye).filter(
        RoomAccesPaye.room_id == room_id,
        RoomAccesPaye.user_id == user["id"],
        RoomAccesPaye.actif == True,
    ).first()
    return {
        "acces":         acces is not None,
        "gratuit":       False,
        "prix_acces":    room.prix_acces,
        "devise_acces":  room.devise_acces or "EUR",
        "type_paiement": room.type_paiement,
    }

@router.post("/rooms/{room_id}/checkout-acces")
def checkout_acces(room_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room or not room.est_payante:
        raise HTTPException(status_code=404, detail="Room payante introuvable")
    if _has_access(room_id, user["id"], db):
        return {"acces": True}
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=400, detail="Stripe non configuré sur ce serveur")
    if not room.stripe_price_id_acces:
        raise HTTPException(status_code=400, detail="Prix Stripe non configuré pour cette room")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    mode = "subscription" if room.type_paiement == "abonnement" else "payment"
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{"price": room.stripe_price_id_acces, "quantity": 1}],
        mode=mode,
        success_url=f"{frontend_url}?stripe=room_success&room={room_id}",
        cancel_url=f"{frontend_url}?stripe=cancel",
        metadata={"room_id": room_id, "user_id": user["id"],
                  "type": room.type_paiement or "unique"},
    )
    return {"checkout_url": session.url}

@router.post("/rooms/acces-paye/webhook")
async def webhook_acces(request: Request, db: Session = Depends(get_db)):
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=400)
    payload    = await request.body()
    sig_header = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Signature webhook invalide")

    if event["type"] == "checkout.session.completed":
        sess    = event["data"]["object"]
        room_id = sess["metadata"].get("room_id")
        user_id = sess["metadata"].get("user_id")
        ptype   = sess["metadata"].get("type", "unique")
        sub_id  = sess.get("subscription")
        if room_id and user_id:
            existe = db.query(RoomAccesPaye).filter(
                RoomAccesPaye.room_id == room_id,
                RoomAccesPaye.user_id == user_id,
            ).first()
            if existe:
                existe.actif = True
                existe.stripe_subscription_id = sub_id
            else:
                db.add(RoomAccesPaye(
                    room_id=room_id, user_id=user_id,
                    type_paiement=ptype,
                    stripe_session_id=sess.get("id"),
                    stripe_subscription_id=sub_id,
                    actif=True,
                ))
            db.commit()

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub   = event["data"]["object"]
        acces = db.query(RoomAccesPaye).filter(
            RoomAccesPaye.stripe_subscription_id == sub["id"]
        ).first()
        if acces:
            acces.actif = False
            db.commit()

    return {"status": "ok"}


# ── Coins ─────────────────────────────────────────────────────────────────────

@router.get("/rooms/{room_id}/coins")
def lister_coins(room_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _has_access(room_id, user["id"], db):
        raise HTTPException(status_code=403, detail="Accès payant requis")
    coins = db.query(Coin).filter(Coin.room_id == room_id).all()
    return [_serialise_coin(c, user["id"]) for c in coins]

@router.post("/rooms/{room_id}/coins")
def creer_coin(room_id: str, data: CreerCoin,
               db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _has_access(room_id, user["id"], db):
        raise HTTPException(status_code=403, detail="Accès payant requis")
    existe = db.query(Coin).filter(
        Coin.room_id == room_id, Coin.user_id == user["id"]
    ).first()
    if existe:
        raise HTTPException(status_code=400, detail="Vous avez déjà un Coin dans cette room")

    from models.user import User as UserModel
    u = db.query(UserModel).filter(UserModel.id == user["id"]).first()

    coin = Coin(
        room_id=room_id,
        user_id=user["id"],
        user_nom=user["nom"],
        user_emoji=u.avatar_emoji if u else "👤",
        titre=data.titre,
        description=data.description,
    )
    db.add(coin)
    db.commit()
    db.refresh(coin)
    return _serialise_coin(coin, user["id"])

@router.get("/coins/{coin_id}")
def get_coin(coin_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Coin introuvable")
    if not _has_access(c.room_id, user["id"], db):
        raise HTTPException(status_code=403, detail="Accès payant requis")
    return _serialise_coin(c, user["id"])

@router.patch("/coins/{coin_id}")
def modifier_coin(coin_id: str, data: UpdateCoin,
                  db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id, Coin.user_id == user["id"]).first()
    if not c:
        raise HTTPException(status_code=403, detail="Interdit")
    if data.titre:       c.titre       = data.titre
    if data.description: c.description = data.description
    db.commit()
    db.refresh(c)
    return _serialise_coin(c, user["id"])

@router.delete("/coins/{coin_id}")
def supprimer_coin(coin_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id, Coin.user_id == user["id"]).first()
    if not c:
        raise HTTPException(status_code=403, detail="Interdit")
    db.delete(c)
    db.commit()
    return {"status": "ok"}


# ── Dossiers ──────────────────────────────────────────────────────────────────

@router.get("/coins/{coin_id}/dossiers")
def lister_dossiers(coin_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Coin introuvable")
    if not _has_access(c.room_id, user["id"], db):
        raise HTTPException(status_code=403, detail="Accès payant requis")
    dossiers = db.query(CoinDossier).filter(CoinDossier.coin_id == coin_id).all()
    est_proprio = c.user_id == user["id"]
    if not est_proprio:
        dossiers = [d for d in dossiers if d.visibilite == "partage"]
    return [_serialise_dossier(d) for d in dossiers]

@router.post("/coins/{coin_id}/dossiers")
def creer_dossier(coin_id: str, data: CreerDossier,
                  db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id, Coin.user_id == user["id"]).first()
    if not c:
        raise HTTPException(status_code=403, detail="Seul le propriétaire peut créer des dossiers")
    d = CoinDossier(
        coin_id=coin_id,
        nom=data.nom,
        visibilite=data.visibilite,
        parent_id=data.parent_id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return _serialise_dossier(d)

@router.patch("/coins/{coin_id}/dossiers/{dossier_id}")
def modifier_dossier(coin_id: str, dossier_id: str, data: UpdateDossier,
                     db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id, Coin.user_id == user["id"]).first()
    if not c:
        raise HTTPException(status_code=403, detail="Interdit")
    d = db.query(CoinDossier).filter(
        CoinDossier.id == dossier_id, CoinDossier.coin_id == coin_id
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    if data.nom:        d.nom        = data.nom
    if data.visibilite: d.visibilite = data.visibilite
    db.commit()
    db.refresh(d)
    return _serialise_dossier(d)

@router.delete("/coins/{coin_id}/dossiers/{dossier_id}")
def supprimer_dossier(coin_id: str, dossier_id: str,
                      db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id, Coin.user_id == user["id"]).first()
    if not c:
        raise HTTPException(status_code=403, detail="Interdit")
    d = db.query(CoinDossier).filter(
        CoinDossier.id == dossier_id, CoinDossier.coin_id == coin_id
    ).first()
    if d:
        db.delete(d)
        db.commit()
    return {"status": "ok"}


# ── Fichiers ──────────────────────────────────────────────────────────────────

@router.get("/coins/{coin_id}/dossiers/{dossier_id}/fichiers")
def lister_fichiers(coin_id: str, dossier_id: str,
                    db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id).first()
    if not c:
        raise HTTPException(status_code=404)
    if not _has_access(c.room_id, user["id"], db):
        raise HTTPException(status_code=403, detail="Accès payant requis")
    d = db.query(CoinDossier).filter(
        CoinDossier.id == dossier_id, CoinDossier.coin_id == coin_id
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    if d.visibilite == "prive" and c.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Dossier privé")
    return [_serialise_fichier(f) for f in d.fichiers]

@router.post("/coins/{coin_id}/dossiers/{dossier_id}/fichiers")
async def uploader_fichier(coin_id: str, dossier_id: str,
                           file: UploadFile = FastAPIFile(...),
                           db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id, Coin.user_id == user["id"]).first()
    if not c:
        raise HTTPException(status_code=403, detail="Interdit")
    d = db.query(CoinDossier).filter(
        CoinDossier.id == dossier_id, CoinDossier.coin_id == coin_id
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")

    ext      = os.path.splitext(file.filename or "")[1]
    file_id  = str(uuid.uuid4())
    filename = f"coin_{file_id}{ext}"
    path     = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    size = os.path.getsize(path)

    db_file = CoinFichier(
        id=file_id, dossier_id=dossier_id, coin_id=coin_id,
        nom=file.filename or filename,
        path=filename, taille=size,
        type_mime=file.content_type or "application/octet-stream",
        uploaded_by=user["id"],
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    return _serialise_fichier(db_file)

@router.get("/coins/fichiers/{fichier_id}/download")
def telecharger_fichier(fichier_id: str,
                        db: Session = Depends(get_db), user=Depends(get_current_user)):
    f = db.query(CoinFichier).filter(CoinFichier.id == fichier_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    d = db.query(CoinDossier).filter(CoinDossier.id == f.dossier_id).first()
    c = db.query(Coin).filter(Coin.id == f.coin_id).first()
    if d and d.visibilite == "prive" and c and c.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Dossier privé")
    path = os.path.join(UPLOAD_DIR, f.path)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Fichier manquant sur le serveur")
    return FileResponse(path, filename=f.nom, media_type=f.type_mime)

@router.delete("/coins/{coin_id}/dossiers/{dossier_id}/fichiers/{fichier_id}")
def supprimer_fichier(coin_id: str, dossier_id: str, fichier_id: str,
                      db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Coin).filter(Coin.id == coin_id, Coin.user_id == user["id"]).first()
    if not c:
        raise HTTPException(status_code=403, detail="Interdit")
    f = db.query(CoinFichier).filter(
        CoinFichier.id == fichier_id, CoinFichier.dossier_id == dossier_id
    ).first()
    if f:
        p = os.path.join(UPLOAD_DIR, f.path)
        if os.path.exists(p):
            os.remove(p)
        db.delete(f)
        db.commit()
    return {"status": "ok"}
