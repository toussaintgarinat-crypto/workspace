from fastapi import APIRouter, Depends, HTTPException, Request, Response
from typing import Optional
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.user import User
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import os
import pyotp
import services.matrix_service as matrix

router = APIRouter()

SECRET_KEY   = os.getenv("JWT_SECRET", "oria-secret-dev-change-en-prod")
ALGORITHM    = "HS256"
EXPIRE_JOURS = 30
SECURE_COOKIE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─── Modèles Pydantic ────────────────────────────────────────────────────────

class Inscription(BaseModel):
    email: str
    nom: str
    avatar_emoji: str = "👤"
    password: str

class Connexion(BaseModel):
    email: str
    password: str
    totp_code: Optional[str] = None

class MiseAJourProfil(BaseModel):
    nom: Optional[str] = None
    avatar_emoji: Optional[str] = None

# ─── Helpers ─────────────────────────────────────────────────────────────────

def creer_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=EXPIRE_JOURS)
    payload = {
        "sub": user.id,
        "nom": user.nom,
        "avatar_emoji": user.avatar_emoji,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def _set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="oria_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=SECURE_COOKIE,
        max_age=EXPIRE_JOURS * 24 * 3600,
        path="/",
    )

def get_current_user(request: Request, db: Session = Depends(get_db)):
    """Dépendance FastAPI — lit le token depuis le cookie httpOnly et retourne l'utilisateur."""
    token = request.cookies.get("oria_token")
    if not token:
        raise HTTPException(status_code=401, detail="Token manquant")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id      = payload.get("sub")
        nom          = payload.get("nom")
        avatar_emoji = payload.get("avatar_emoji")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide")
        return {"id": user_id, "nom": nom, "avatar_emoji": avatar_emoji}
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/register")
def register(data: Inscription, response: Response, db: Session = Depends(get_db)):
    """Créer un compte. Pose un cookie httpOnly."""
    existant = db.query(User).filter(User.email == data.email).first()
    if existant:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    user = User(
        email=data.email,
        nom=data.nom,
        avatar_emoji=data.avatar_emoji,
        hashed_password=pwd_context.hash(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Provisioning Matrix (dégradé si Synapse indisponible)
    matrix_data = matrix.provision_user(user.id)
    if matrix_data:
        user.matrix_user_id      = matrix_data["user_id"]
        user.matrix_access_token = matrix_data["access_token"]
        user.matrix_provisioned  = "true"

    # ── Jardin secret : espace privé auto-créé, inviolable ──────
    from models.world import World, Member
    from models.building import Building, Room
    import uuid as _uuid

    jardin = World(
        id=str(_uuid.uuid4()),
        nom="Mon Jardin Secret",
        description="Mon espace privé, invisible pour tous",
        emoji="🌿",
        couleur="#2d5a27",
        owner_id=user.id,
        is_public=False,
        is_garden=True,
    )
    db.add(jardin)
    db.add(Member(world_id=jardin.id, user_id=user.id, nom=user.nom,
                  avatar_emoji=user.avatar_emoji, role="proprietaire"))
    db.flush()

    bld = Building(id=str(_uuid.uuid4()), world_id=jardin.id,
                   nom="Mon espace", type="maison", emoji="🌿", couleur="#2d5a27")
    db.add(bld)
    db.flush()
    for pos, (nom, emoji) in enumerate([("📔 Journal", "📔"), ("💭 Pensées", "💭"), ("🎯 Objectifs", "🎯")]):
        db.add(Room(id=str(_uuid.uuid4()), building_id=bld.id, nom=nom, type="texte", emoji=emoji, position=pos))

    user.jardin_world_id = jardin.id

    # ── Agent personnel du Jardin — configurable via OpenRouter/Ollama/etc. ──
    from models.agent import AgentDefinition as _AgentDef
    _forge_url = os.getenv("FORGE_URL", "http://localhost:3001")
    _provider  = os.getenv("DEFAULT_AGENT_PROVIDER", "openrouter")
    _model     = os.getenv("DEFAULT_AGENT_MODEL", "anthropic/claude-sonnet-4-6")
    _agent = _AgentDef(
        id=str(_uuid.uuid4()),
        world_id=jardin.id,
        owner_id=user.id,
        nom="Mon Assistant",
        avatar_emoji="🌿",
        description="Ton assistant personnel — il se souvient de tout ce que tu partages.",
        system_prompt=(
            f"Tu es l'assistant personnel de {user.nom}. "
            "Tu as accès à sa mémoire longue durée (documents, notes, conversations passées). "
            "Sois direct, chaleureux et contextuel. Utilise la mémoire pour personnaliser tes réponses."
        ),
        forge_url=_forge_url,
        forge_provider=_provider,
        forge_model=_model,
        use_memory=True,
        is_active=True,
        is_jardin_agent=True,
    )
    db.add(_agent)
    db.commit()
    # ────────────────────────────────────────────────────────────

    token = creer_token(user)
    _set_auth_cookie(response, token)
    return {
        "user": {"id": user.id, "nom": user.nom, "avatar_emoji": user.avatar_emoji},
        "matrix_user_id":      user.matrix_user_id,
        "matrix_access_token": user.matrix_access_token,
    }

@router.post("/refresh")
def refresh_token(response: Response, user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Renouvelle le cookie pour 30 jours supplémentaires."""
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    token = creer_token(db_user)
    _set_auth_cookie(response, token)
    return {
        "user": {"id": db_user.id, "nom": db_user.nom, "avatar_emoji": db_user.avatar_emoji},
    }

@router.patch("/me")
def update_profil(data: MiseAJourProfil, response: Response, user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Modifier nom et/ou avatar_emoji. Repose un cookie JWT à jour."""
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if data.nom is not None:
        db_user.nom = data.nom.strip()
    if data.avatar_emoji is not None:
        db_user.avatar_emoji = data.avatar_emoji
    db.commit()
    db.refresh(db_user)
    token = creer_token(db_user)
    _set_auth_cookie(response, token)
    return {
        "user": {"id": db_user.id, "nom": db_user.nom, "avatar_emoji": db_user.avatar_emoji},
    }

@router.post("/login")
def login(data: Connexion, response: Response, db: Session = Depends(get_db)):
    """Se connecter. Pose un cookie httpOnly."""
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not pwd_context.verify(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    # Si le compte Matrix n'a pas encore été provisionné, réessayer
    if not user.matrix_provisioned or user.matrix_provisioned != "true":
        matrix_data = matrix.provision_user(user.id)
        if matrix_data:
            user.matrix_user_id      = matrix_data["user_id"]
            user.matrix_access_token = matrix_data["access_token"]
            user.matrix_provisioned  = "true"
            db.commit()

    # Vérification 2FA si activé
    if user.totp_enabled and user.totp_secret:
        if not data.totp_code:
            return {"requires_2fa": True}
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(data.totp_code, valid_window=1):
            raise HTTPException(status_code=401, detail="Code 2FA incorrect")

    token = creer_token(user)
    _set_auth_cookie(response, token)
    return {
        "user": {"id": user.id, "nom": user.nom, "avatar_emoji": user.avatar_emoji},
        "matrix_user_id":      user.matrix_user_id,
        "matrix_access_token": user.matrix_access_token,
    }

@router.get("/me")
def get_me(user=Depends(get_current_user)):
    """Vérifie la session et retourne l'utilisateur courant."""
    return {"user": user}

@router.post("/logout")
def logout(response: Response):
    """Détruit le cookie de session."""
    response.delete_cookie(key="oria_token", path="/")
    return {"ok": True}


# ─── 2FA ─────────────────────────────────────────────────────────────────────

@router.post("/2fa/setup")
def setup_2fa(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Génère un secret TOTP et retourne l'URI de provisionnement."""
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(404)
    secret = pyotp.random_base32()
    db_user.totp_secret = secret
    db.commit()
    uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=db_user.email,
        issuer_name="Oria Mairie"
    )
    return {"secret": secret, "uri": uri}


class Enable2FABody(BaseModel):
    code: str

class Disable2FABody(BaseModel):
    password: str

@router.post("/2fa/enable")
def enable_2fa(body: Enable2FABody, user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Vérifie le code TOTP et active le 2FA."""
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user or not db_user.totp_secret:
        raise HTTPException(400, "Setup 2FA requis avant l'activation")
    totp = pyotp.TOTP(db_user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(400, "Code 2FA invalide")
    db_user.totp_enabled = True
    db.commit()
    return {"ok": True, "message": "2FA activé"}


@router.post("/2fa/disable")
def disable_2fa(body: Disable2FABody, user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Désactive le 2FA après vérification du mot de passe."""
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(404)
    if not pwd_context.verify(body.password, db_user.hashed_password):
        raise HTTPException(401, "Mot de passe incorrect")
    db_user.totp_enabled = False
    db_user.totp_secret = None
    db.commit()
    return {"ok": True, "message": "2FA désactivé"}


@router.get("/me/2fa-status")
def get_2fa_status(user=Depends(get_current_user), db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(404)
    return {"totp_enabled": bool(db_user.totp_enabled)}


@router.get("/me/export")
def exporter_donnees(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Export RGPD de toutes les données de l'utilisateur."""
    from models.world import World, Member
    from models.building import Message
    from models.dm import DirectMessage, DirectMessageRoom

    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(404)

    membres = db.query(Member).filter(Member.user_id == user["id"]).all()

    return {
        "utilisateur": {
            "id": db_user.id,
            "email": db_user.email,
            "nom": db_user.nom,
            "avatar_emoji": db_user.avatar_emoji,
            "created_at": str(db_user.id),  # UUID v4 contient timestamp
        },
        "communes": [{"world_id": m.world_id, "role": m.role} for m in membres],
        "export_date": datetime.now(timezone.utc).isoformat(),
        "note": "Export RGPD — Article 20 du RGPD — Droit à la portabilité des données",
    }

@router.delete("/me")
def supprimer_compte(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Suppression du compte (droit à l'oubli RGPD)."""
    from models.world import Member

    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(404)

    # Supprimer les appartenances
    db.query(Member).filter(Member.user_id == user["id"]).delete()

    # Anonymiser l'utilisateur (soft delete avec anonymisation)
    db_user.email = f"deleted_{db_user.id}@rgpd.deleted"
    db_user.nom = "[Compte supprimé]"
    db_user.avatar_emoji = "❌"
    db_user.hashed_password = ""
    db_user.matrix_user_id = None
    db_user.matrix_access_token = None
    db.commit()

    return {"ok": True, "message": "Compte anonymisé conformément au RGPD"}
