from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.user import User
from jose import JWTError
import os
import services.matrix_service as matrix

from agent_personnel_shared.keycloak_auth import (
    KeycloakSettings,
    verify_token_sync,
)

router = APIRouter()

KEYCLOAK_URL      = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
KEYCLOAK_REALM    = os.getenv("KEYCLOAK_REALM", "oria")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "oria-app")

# Configuration Keycloak partagée. `audience` reflète l'historique Oria (CLIENT_ID).
# Pour passer en mode multi-tenant : vider la variable d'env KEYCLOAK_CLIENT_ID.
_KC = KeycloakSettings(
    url=KEYCLOAK_URL,
    realm=KEYCLOAK_REALM,
    audience=KEYCLOAK_CLIENT_ID,
    jwks_ttl=300,
    extra_decode_options={"verify_at_hash": False},
)


def _get_jwks() -> dict:
    """Compat — exposé pour les routers existants (worlds/admin/social)."""
    from agent_personnel_shared.keycloak_auth import _fetch_jwks_sync
    try:
        return _fetch_jwks_sync(_KC)
    except Exception as exc:
        if _KC._jwks_cache is None:
            raise HTTPException(503, f"Keycloak JWKS indisponible: {exc}")
        return _KC._jwks_cache


def _provision_user(keycloak_sub: str, payload: dict, db: Session) -> User:
    """Crée un utilisateur Oria au premier login Keycloak et provisionne ses ressources."""
    nom = (payload.get("nom") or payload.get("preferred_username")
           or payload.get("name") or "Utilisateur")
    email = payload.get("email") or f"{keycloak_sub}@oria.local"
    avatar_emoji = payload.get("avatarEmoji") or "👤"

    # Liaison sur l'email si un compte local existait avant la migration Keycloak
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        if existing.id != keycloak_sub:
            existing.id = keycloak_sub
            db.commit()
        return existing

    import uuid as _uuid
    user = User(
        id=keycloak_sub,
        email=email,
        nom=nom,
        avatar_emoji=avatar_emoji,
        hashed_password="",
    )
    db.add(user)
    db.flush()

    # Matrix provisioning (dégradé si Synapse indisponible)
    matrix_data = matrix.provision_user(user.id)
    if matrix_data:
        user.matrix_user_id      = matrix_data["user_id"]
        user.matrix_access_token = matrix_data["access_token"]
        user.matrix_provisioned  = "true"

    # Jardin Secret inviolable
    from models.world import World, Member
    from models.building import Building, Room

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
    for pos, (nom_room, emoji) in enumerate([
        ("📔 Journal", "📔"), ("💭 Pensées", "💭"), ("🎯 Objectifs", "🎯"),
    ]):
        db.add(Room(id=str(_uuid.uuid4()), building_id=bld.id,
                   nom=nom_room, type="texte", emoji=emoji, position=pos))

    user.jardin_world_id = jardin.id

    # Agent personnel du Jardin
    from models.agent import AgentDefinition as _AgentDef
    _forge_url = os.getenv("FORGE_URL", "http://localhost:3001")
    _provider  = os.getenv("DEFAULT_AGENT_PROVIDER", "openrouter")
    _model     = os.getenv("DEFAULT_AGENT_MODEL", "anthropic/claude-sonnet-4-6")
    db.add(_AgentDef(
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
    ))
    db.commit()
    return user


def get_current_user(request: Request, db: Session = Depends(get_db)):
    """Dépendance FastAPI — valide le Bearer token Keycloak et auto-provisionne l'utilisateur."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token manquant")
    token = auth[7:]
    try:
        payload = verify_token_sync(token, _KC)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Token invalide: {exc}")

    keycloak_sub = payload.get("sub")
    if not keycloak_sub:
        raise HTTPException(status_code=401, detail="Token invalide (sub manquant)")

    user = db.query(User).filter(User.id == keycloak_sub).first()
    if not user:
        user = _provision_user(keycloak_sub, payload, db)

    return {"id": user.id, "nom": user.nom, "avatar_emoji": user.avatar_emoji}


# ─── Modèles Pydantic ────────────────────────────────────────────────────────

class MiseAJourProfil(BaseModel):
    nom: Optional[str] = None
    avatar_emoji: Optional[str] = None
    bio: Optional[str] = None
    is_public: Optional[bool] = None
    documents_partageables_par_defaut: Optional[bool] = None


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/me")
def get_me(user=Depends(get_current_user), db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user["id"]).first()
    return {
        "user": {
            **user,
            "bio": db_user.bio or "" if db_user else "",
            "is_public": db_user.is_public if db_user else True,
            "documents_partageables_par_defaut": db_user.documents_partageables_par_defaut if db_user else False,
            "setup_completed_at": (
                db_user.setup_completed_at.isoformat()
                if (db_user and db_user.setup_completed_at) else None
            ),
        },
        "matrix_user_id":      db_user.matrix_user_id if db_user else None,
        "matrix_access_token": db_user.matrix_access_token if db_user else None,
    }


@router.post("/logout")
def logout():
    # Le logout effectif se fait côté frontend via keycloak.logout()
    return {"ok": True}


@router.patch("/me")
def update_profil(data: MiseAJourProfil, user=Depends(get_current_user), db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if data.nom is not None:
        db_user.nom = data.nom.strip()
    if data.avatar_emoji is not None:
        db_user.avatar_emoji = data.avatar_emoji
    if data.bio is not None:
        db_user.bio = data.bio
    if data.is_public is not None:
        db_user.is_public = data.is_public
    if data.documents_partageables_par_defaut is not None:
        db_user.documents_partageables_par_defaut = data.documents_partageables_par_defaut
    db.commit()
    db.refresh(db_user)
    return {
        "user": {
            "id": db_user.id, "nom": db_user.nom, "avatar_emoji": db_user.avatar_emoji,
            "bio": db_user.bio or "", "is_public": db_user.is_public,
            "documents_partageables_par_defaut": db_user.documents_partageables_par_defaut,
            "setup_completed_at": (
                db_user.setup_completed_at.isoformat() if db_user.setup_completed_at else None
            ),
        }
    }


@router.post("/me/setup-complete")
def mark_setup_complete(user=Depends(get_current_user), db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(404, "Utilisateur introuvable")
    db_user.setup_completed_at = datetime.now(timezone.utc)
    db.commit()
    return {"setup_completed_at": db_user.setup_completed_at.isoformat()}


@router.delete("/me/setup-complete")
def reset_setup(user=Depends(get_current_user), db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(404, "Utilisateur introuvable")
    db_user.setup_completed_at = None
    db.commit()
    return {"ok": True}


@router.get("/me/2fa-status")
def get_2fa_status(user=Depends(get_current_user)):
    # 2FA géré par Keycloak — toujours False depuis Oria
    return {"totp_enabled": False}


@router.get("/me/export")
def exporter_donnees(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Export RGPD de toutes les données de l'utilisateur."""
    from models.world import Member
    from datetime import datetime, timezone

    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(404)

    membres = db.query(Member).filter(Member.user_id == user["id"]).all()
    return {
        "utilisateur": {
            "id":          db_user.id,
            "email":       db_user.email,
            "nom":         db_user.nom,
            "avatar_emoji": db_user.avatar_emoji,
        },
        "communes":    [{"world_id": m.world_id, "role": m.role} for m in membres],
        "export_date": datetime.now(timezone.utc).isoformat(),
        "note":        "Export RGPD — Article 20 du RGPD — Droit à la portabilité des données",
    }


@router.delete("/me")
def supprimer_compte(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Suppression du compte (droit à l'oubli RGPD)."""
    from models.world import Member

    db_user = db.query(User).filter(User.id == user["id"]).first()
    if not db_user:
        raise HTTPException(404)

    db.query(Member).filter(Member.user_id == user["id"]).delete()
    db_user.email           = f"deleted_{db_user.id}@rgpd.deleted"
    db_user.nom             = "[Compte supprimé]"
    db_user.avatar_emoji    = "❌"
    db_user.hashed_password = ""
    db_user.matrix_user_id  = None
    db_user.matrix_access_token = None
    db.commit()
    return {"ok": True, "message": "Compte anonymisé conformément au RGPD"}
