from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.user import User
from jose import JWTError

from config import config
from services.auth_service import AuthService, get_auth_service
import services.matrix_service as matrix

from agent_personnel_shared.keycloak_auth import (
    KeycloakSettings,
    verify_token_sync,
)

router = APIRouter()

# Configuration Keycloak partagée. `audience` reflète l'historique Oria (CLIENT_ID).
# Pour passer en mode multi-tenant : vider la variable d'env KEYCLOAK_CLIENT_ID.
_KC = KeycloakSettings(
    url=config.KEYCLOAK_URL,
    realm=config.KEYCLOAK_REALM,
    audience=config.KEYCLOAK_CLIENT_ID,
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

    svc = AuthService(db)
    user = svc.get_user(keycloak_sub)
    if not user:
        user = svc.provision_new_user(keycloak_sub, payload, matrix)

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
def get_me(
    user=Depends(get_current_user),
    svc: AuthService = Depends(get_auth_service),
):
    db_user = svc.get_user(user["id"])
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
def update_profil(
    data: MiseAJourProfil,
    user=Depends(get_current_user),
    svc: AuthService = Depends(get_auth_service),
):
    db_user = svc.get_user(user["id"])
    if not db_user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    nom_clean = data.nom.strip() if data.nom is not None else None
    db_user = svc.update_profile(
        db_user,
        nom=nom_clean,
        avatar_emoji=data.avatar_emoji,
        bio=data.bio,
        is_public=data.is_public,
        documents_partageables_par_defaut=data.documents_partageables_par_defaut,
    )
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
def mark_setup_complete(
    user=Depends(get_current_user),
    svc: AuthService = Depends(get_auth_service),
):
    db_user = svc.get_user(user["id"])
    if not db_user:
        raise HTTPException(404, "Utilisateur introuvable")
    db_user = svc.mark_setup_completed(db_user)
    return {"setup_completed_at": db_user.setup_completed_at.isoformat()}


@router.delete("/me/setup-complete")
def reset_setup(
    user=Depends(get_current_user),
    svc: AuthService = Depends(get_auth_service),
):
    db_user = svc.get_user(user["id"])
    if not db_user:
        raise HTTPException(404, "Utilisateur introuvable")
    svc.reset_setup(db_user)
    return {"ok": True}


@router.get("/me/2fa-status")
def get_2fa_status(user=Depends(get_current_user)):
    # 2FA géré par Keycloak — toujours False depuis Oria
    return {"totp_enabled": False}


@router.get("/me/export")
def exporter_donnees(
    user=Depends(get_current_user),
    svc: AuthService = Depends(get_auth_service),
):
    """Export RGPD de toutes les données de l'utilisateur."""
    from datetime import datetime, timezone

    db_user = svc.get_user(user["id"])
    if not db_user:
        raise HTTPException(404)

    membres = svc.list_membres_for_user(user["id"])
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
def supprimer_compte(
    user=Depends(get_current_user),
    svc: AuthService = Depends(get_auth_service),
):
    """Suppression du compte (droit à l'oubli RGPD)."""
    db_user = svc.get_user(user["id"])
    if not db_user:
        raise HTTPException(404)
    svc.anonymize_account(db_user)
    return {"ok": True, "message": "Compte anonymisé conformément au RGPD"}
