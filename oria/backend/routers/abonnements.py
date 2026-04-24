from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models.world import World, Member
from models.abonnement import Abonnement, MembreAbonnement, RoomAbonnement
from routers.auth import get_current_user
import uuid, os

# ── Stripe (optionnel) ────────────────────────────────────────────────────────
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

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreerAbonnement(BaseModel):
    nom:         str
    description: str   = ""
    couleur:     str   = "#6366f1"
    prix:        float = 0.0
    devise:      str   = "EUR"

class UpdateAbonnement(BaseModel):
    nom:         str = ""
    description: str = ""
    couleur:     str = ""

class AssignerAbonnement(BaseModel):
    abonnement_id: str


# ── Helper ────────────────────────────────────────────────────────────────────

def _serialise(a: Abonnement) -> dict:
    return {
        "id":             a.id,
        "nom":            a.nom,
        "description":    a.description,
        "couleur":        a.couleur,
        "prix":           a.prix,
        "devise":         a.devise,
        "has_stripe":     bool(a.stripe_price_id),
        "stripe_price_id": a.stripe_price_id,
    }


# ── Tiers d'abonnement ────────────────────────────────────────────────────────

@router.get("/worlds/{world_id}/abonnements")
def lister_abonnements(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    abonnements = (db.query(Abonnement)
                   .filter(Abonnement.world_id == world_id, Abonnement.actif == True)
                   .all())
    return [_serialise(a) for a in abonnements]


@router.post("/worlds/{world_id}/abonnements")
def creer_abonnement(world_id: str, data: CreerAbonnement,
                     db: Session = Depends(get_db), user=Depends(get_current_user)):
    w = db.query(World).filter(World.id == world_id).first()
    if not w or w.owner_id != user["id"]:
        raise HTTPException(status_code=403, detail="Interdit")

    a = Abonnement(
        world_id=world_id, nom=data.nom, description=data.description,
        couleur=data.couleur, prix=data.prix, devise=data.devise,
    )

    if STRIPE_ENABLED and data.prix > 0:
        try:
            product = stripe.Product.create(name=data.nom, description=data.description or None)
            price = stripe.Price.create(
                product=product.id,
                unit_amount=int(data.prix * 100),
                currency=data.devise.lower(),
                recurring={"interval": "month"},
            )
            a.stripe_product_id = product.id
            a.stripe_price_id   = price.id
        except Exception:
            pass

    db.add(a)
    db.commit()
    db.refresh(a)
    return _serialise(a)


@router.patch("/worlds/{world_id}/abonnements/{abonnement_id}")
def modifier_abonnement(world_id: str, abonnement_id: str, data: UpdateAbonnement,
                        db: Session = Depends(get_db), user=Depends(get_current_user)):
    w = db.query(World).filter(World.id == world_id).first()
    if not w or w.owner_id != user["id"]:
        raise HTTPException(status_code=403, detail="Interdit")
    a = db.query(Abonnement).filter(Abonnement.id == abonnement_id,
                                     Abonnement.world_id == world_id).first()
    if not a:
        raise HTTPException(status_code=404)
    if data.nom:                     a.nom         = data.nom
    if data.description is not None: a.description = data.description
    if data.couleur:                 a.couleur     = data.couleur
    db.commit()
    db.refresh(a)
    return _serialise(a)


@router.delete("/worlds/{world_id}/abonnements/{abonnement_id}")
def supprimer_abonnement(world_id: str, abonnement_id: str,
                         db: Session = Depends(get_db), user=Depends(get_current_user)):
    w = db.query(World).filter(World.id == world_id).first()
    if not w or w.owner_id != user["id"]:
        raise HTTPException(status_code=403, detail="Interdit")
    a = db.query(Abonnement).filter(Abonnement.id == abonnement_id,
                                     Abonnement.world_id == world_id).first()
    if a:
        db.delete(a)
        db.commit()
    return {"status": "ok"}


# ── Abonnements d'un membre ───────────────────────────────────────────────────

@router.get("/worlds/{world_id}/membres/{user_id}/abonnements")
def get_abonnements_membre(world_id: str, user_id: str,
                           db: Session = Depends(get_db), user=Depends(get_current_user)):
    membre = db.query(Member).filter(Member.world_id == world_id,
                                      Member.user_id == user_id).first()
    if not membre:
        raise HTTPException(status_code=404)
    abonnements = (db.query(MembreAbonnement)
                   .filter(MembreAbonnement.member_id == membre.id,
                            MembreAbonnement.actif == True)
                   .all())
    return [
        {
            "id":                   ma.id,
            "abonnement":           _serialise(ma.abonnement),
            "date_debut":           ma.date_debut.isoformat() if ma.date_debut else None,
            "date_fin":             ma.date_fin.isoformat()   if ma.date_fin   else None,
            "assigne_manuellement": ma.assigne_manuellement,
        }
        for ma in abonnements
    ]


@router.post("/worlds/{world_id}/membres/{user_id}/abonnements")
def assigner_abonnement(world_id: str, user_id: str, data: AssignerAbonnement,
                        db: Session = Depends(get_db), user=Depends(get_current_user)):
    w = db.query(World).filter(World.id == world_id).first()
    if not w or w.owner_id != user["id"]:
        raise HTTPException(status_code=403, detail="Seul le propriétaire peut assigner des abonnements")
    membre = db.query(Member).filter(Member.world_id == world_id,
                                      Member.user_id == user_id).first()
    if not membre:
        raise HTTPException(status_code=404)
    existe = (db.query(MembreAbonnement)
              .filter(MembreAbonnement.member_id == membre.id,
                       MembreAbonnement.abonnement_id == data.abonnement_id,
                       MembreAbonnement.actif == True)
              .first())
    if existe:
        return {"status": "deja_abonne"}
    db.add(MembreAbonnement(
        member_id=membre.id,
        abonnement_id=data.abonnement_id,
        actif=True,
        assigne_manuellement=True,
    ))
    db.commit()
    return {"status": "ok"}


@router.delete("/worlds/{world_id}/membres/{user_id}/abonnements/{abonnement_id}")
def retirer_abonnement(world_id: str, user_id: str, abonnement_id: str,
                       db: Session = Depends(get_db), user=Depends(get_current_user)):
    w = db.query(World).filter(World.id == world_id).first()
    if not w or w.owner_id != user["id"]:
        raise HTTPException(status_code=403, detail="Interdit")
    membre = db.query(Member).filter(Member.world_id == world_id,
                                      Member.user_id == user_id).first()
    if not membre:
        raise HTTPException(status_code=404)
    ma = (db.query(MembreAbonnement)
          .filter(MembreAbonnement.member_id == membre.id,
                   MembreAbonnement.abonnement_id == abonnement_id)
          .first())
    if ma:
        db.delete(ma)
        db.commit()
    return {"status": "ok"}


# ── Stripe checkout ───────────────────────────────────────────────────────────

@router.post("/abonnements/{abonnement_id}/checkout")
def creer_checkout(abonnement_id: str,
                   db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=400, detail="Stripe non configuré sur ce serveur")
    a = db.query(Abonnement).filter(Abonnement.id == abonnement_id).first()
    if not a or not a.stripe_price_id:
        raise HTTPException(status_code=404, detail="Abonnement Stripe introuvable")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{"price": a.stripe_price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{frontend_url}?stripe=success&abonnement={abonnement_id}",
        cancel_url=f"{frontend_url}?stripe=cancel",
        metadata={"abonnement_id": abonnement_id, "user_id": user["id"]},
    )
    return {"checkout_url": session.url}


# ── Stripe webhook ────────────────────────────────────────────────────────────

@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=400)
    payload    = await request.body()
    sig_header = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Signature webhook invalide")

    if event["type"] == "checkout.session.completed":
        session       = event["data"]["object"]
        abonnement_id = session["metadata"].get("abonnement_id")
        user_id       = session["metadata"].get("user_id")
        stripe_sub_id = session.get("subscription")

        if abonnement_id and user_id:
            a = db.query(Abonnement).filter(Abonnement.id == abonnement_id).first()
            if a:
                membre = db.query(Member).filter(Member.world_id == a.world_id,
                                                  Member.user_id == user_id).first()
                if membre:
                    existe = (db.query(MembreAbonnement)
                              .filter(MembreAbonnement.member_id == membre.id,
                                       MembreAbonnement.abonnement_id == abonnement_id)
                              .first())
                    if existe:
                        existe.actif = True
                        existe.stripe_subscription_id = stripe_sub_id
                    else:
                        db.add(MembreAbonnement(
                            member_id=membre.id,
                            abonnement_id=abonnement_id,
                            actif=True,
                            stripe_subscription_id=stripe_sub_id,
                        ))
                    db.commit()

    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub = event["data"]["object"]
        ma  = (db.query(MembreAbonnement)
               .filter(MembreAbonnement.stripe_subscription_id == sub["id"])
               .first())
        if ma:
            ma.actif = False
            db.commit()

    return {"status": "ok"}
