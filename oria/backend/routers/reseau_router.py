"""
Router Intercommunalité — Documents partagés entre worlds en réseau.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from routers.auth import get_current_user
from models.world import Member, World
from models.network import WorldLink
from models.document import Document

router = APIRouter()


def _is_member(db: Session, world_id: str, user_id: str) -> bool:
    return bool(db.query(Member).filter_by(world_id=world_id, user_id=user_id).first())


def _categorise(nom: str) -> str:
    n = nom.lower()
    if any(k in n for k in ("deliber", "délibér", "deliberation")):
        return "deliberation"
    if any(k in n for k in ("arrete", "arrêté", "arrête")):
        return "arrete"
    return "autre"


def _doc_dict(doc: Document, world: World) -> dict:
    return {
        "id":          doc.id,
        "nom":         doc.nom,
        "nom_original": doc.nom_original,
        "type_mime":   doc.type_mime,
        "taille":      doc.taille,
        "created_at":  doc.created_at.isoformat(),
        "partage_reseau": doc.partage_reseau,
        "commune": {
            "id":    world.id,
            "nom":   world.nom,
            "emoji": world.emoji,
        },
    }


def _linked_world_ids(db: Session, world_id: str) -> list[str]:
    """Retourne les IDs de tous les worlds liés (dans les deux sens)."""
    links_out = db.query(WorldLink).filter(WorldLink.from_world_id == world_id).all()
    links_in  = db.query(WorldLink).filter(WorldLink.to_world_id  == world_id).all()
    ids = set()
    for l in links_out:
        ids.add(l.to_world_id)
    for l in links_in:
        ids.add(l.from_world_id)
    return list(ids)


@router.get("/documents")
def documents_reseau(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_member(db, world_id, user["id"]):
        raise HTTPException(403)

    linked_ids = _linked_world_ids(db, world_id)
    if not linked_ids:
        return {"communes": [], "deliberations": [], "arretes": [], "autres": []}

    # Worlds liés (communes)
    worlds = {w.id: w for w in db.query(World).filter(World.id.in_(linked_ids)).all()}

    # Documents partagés de ces worlds
    docs = db.query(Document).filter(
        Document.world_id.in_(linked_ids),
        Document.partage_reseau == True,  # noqa: E712
    ).order_by(Document.created_at.desc()).all()

    deliberations, arretes, autres = [], [], []
    for doc in docs:
        world = worlds.get(doc.world_id)
        if not world:
            continue
        d = _doc_dict(doc, world)
        cat = _categorise(doc.nom_original or doc.nom)
        if cat == "deliberation":
            deliberations.append(d)
        elif cat == "arrete":
            arretes.append(d)
        else:
            autres.append(d)

    communes = [
        {"id": w.id, "nom": w.nom, "emoji": w.emoji}
        for w in worlds.values()
    ]

    return {
        "communes":      communes,
        "deliberations": deliberations,
        "arretes":       arretes,
        "autres":        autres,
    }


@router.get("/documents/mes-docs")
def mes_docs_partageables(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Documents de l'utilisateur dans ce world — pour gérer le partage réseau."""
    if not _is_member(db, world_id, user["id"]):
        raise HTTPException(403)

    docs = (
        db.query(Document)
        .filter_by(owner_id=user["id"], world_id=world_id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return [
        {
            "id":           d.id,
            "nom":          d.nom,
            "nom_original": d.nom_original,
            "type_mime":    d.type_mime,
            "taille":       d.taille,
            "created_at":   d.created_at.isoformat(),
            "partage_reseau": d.partage_reseau,
        }
        for d in docs
    ]


class PartagerBody(BaseModel):
    doc_id:  str
    partage: bool


@router.post("/documents/partager")
def partager_document(body: PartagerBody, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Active ou désactive le partage réseau d'un document appartenant à l'utilisateur."""
    doc = db.query(Document).filter_by(id=body.doc_id, owner_id=user["id"]).first()
    if not doc:
        raise HTTPException(404, "Document introuvable ou accès refusé")
    doc.partage_reseau = body.partage
    db.commit()
    return {"ok": True, "doc_id": doc.id, "partage_reseau": doc.partage_reseau}
