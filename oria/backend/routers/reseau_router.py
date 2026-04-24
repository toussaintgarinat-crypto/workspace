"""
Router Intercommunalité — Documents partagés entre communes en réseau.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from routers.auth import get_current_user
from models.network import WorldLink
from models.mairie import Deliberation, Arrete
from models.world import World, Member

router = APIRouter()


def _is_member(db: Session, world_id: str, user_id: str) -> bool:
    return bool(db.query(Member).filter_by(world_id=world_id, user_id=user_id).first())


@router.get("/documents")
def documents_reseau(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Retourne les documents partagés par les communes liées (intercommunalité)."""
    if not _is_member(db, world_id, user["id"]):
        raise HTTPException(403)

    # Trouver toutes les communes liées (dans les deux sens)
    liens_out = db.query(WorldLink).filter_by(from_world_id=world_id).all()
    liens_in  = db.query(WorldLink).filter_by(to_world_id=world_id).all()

    commune_ids = set()
    for lien in liens_out:
        commune_ids.add(lien.to_world_id)
    for lien in liens_in:
        commune_ids.add(lien.from_world_id)

    if not commune_ids:
        return {"communes": [], "deliberations": [], "arretes": []}

    # Charger les docs partagés de ces communes (non confidentiels + reseau_visible)
    delibs = (
        db.query(Deliberation)
        .filter(
            Deliberation.world_id.in_(commune_ids),
            Deliberation.confidentiel == False,
            Deliberation.reseau_visible == True,
        )
        .order_by(Deliberation.created_at.desc())
        .limit(50)
        .all()
    )

    arretes = (
        db.query(Arrete)
        .filter(
            Arrete.world_id.in_(commune_ids),
            Arrete.confidentiel == False,
            Arrete.reseau_visible == True,
        )
        .order_by(Arrete.created_at.desc())
        .limit(50)
        .all()
    )

    # Charger les noms des communes
    communes = {
        w.id: {"id": w.id, "nom": w.nom, "emoji": w.emoji}
        for w in db.query(World).filter(World.id.in_(commune_ids)).all()
    }

    def delib_dict(d):
        return {
            "id": d.id, "type": "deliberation",
            "numero": d.numero, "titre": d.titre,
            "date_seance": d.date_seance, "statut": d.statut,
            "workflow_statut": d.workflow_statut,
            "commune": communes.get(d.world_id, {"nom": "Inconnue"}),
        }

    def arrete_dict(a):
        return {
            "id": a.id, "type": "arrete",
            "numero": a.numero, "objet": a.objet,
            "date_arrete": a.date_arrete, "type_arrete": a.type_arrete,
            "workflow_statut": a.workflow_statut,
            "commune": communes.get(a.world_id, {"nom": "Inconnue"}),
        }

    return {
        "communes": list(communes.values()),
        "deliberations": [delib_dict(d) for d in delibs],
        "arretes": [arrete_dict(a) for a in arretes],
    }
