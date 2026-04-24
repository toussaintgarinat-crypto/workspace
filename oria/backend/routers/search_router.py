"""
Recherche plein-texte globale sur les données de la commune.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from routers.auth import get_current_user
from models.world import Member
from models.mairie import Deliberation, Arrete, AgentElu, Ticket

router = APIRouter()


def _is_admin(db, world_id, user_id):
    m = db.query(Member).filter_by(world_id=world_id, user_id=user_id).first()
    return m and m.role in ("proprietaire", "admin")


@router.get("/")
def rechercher(
    q: str = Query(..., min_length=2),
    world_id: str = Query(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    admin = _is_admin(db, world_id, user["id"])
    pattern = f"%{q}%"
    results = {"deliberations": [], "arretes": [], "annuaire": [], "tickets": []}

    # Délibérations
    delibs = db.query(Deliberation).filter(
        Deliberation.world_id == world_id,
        or_(
            Deliberation.titre.ilike(pattern),
            Deliberation.numero.ilike(pattern),
            Deliberation.objet.ilike(pattern),
        )
    )
    if not admin:
        delibs = delibs.filter_by(confidentiel=False)
    for d in delibs.limit(10).all():
        results["deliberations"].append({"id": d.id, "label": f"{d.numero} — {d.titre}", "date": d.date_seance, "statut": d.statut})

    # Arrêtés
    arretes = db.query(Arrete).filter(
        Arrete.world_id == world_id,
        or_(Arrete.numero.ilike(pattern), Arrete.objet.ilike(pattern))
    )
    if not admin:
        arretes = arretes.filter_by(confidentiel=False)
    for a in arretes.limit(10).all():
        results["arretes"].append({"id": a.id, "label": f"{a.numero} — {a.objet}", "date": a.date_arrete, "type": a.type_arrete})

    # Annuaire
    for a in db.query(AgentElu).filter(
        AgentElu.world_id == world_id,
        AgentElu.actif == True,
        or_(
            AgentElu.nom.ilike(pattern), AgentElu.prenom.ilike(pattern),
            AgentElu.fonction.ilike(pattern), AgentElu.service.ilike(pattern),
        )
    ).limit(10).all():
        results["annuaire"].append({"id": a.id, "label": f"{a.prenom} {a.nom}", "fonction": a.fonction, "service": a.service})

    # Tickets (admin only)
    if admin:
        for t in db.query(Ticket).filter(
            Ticket.world_id == world_id,
            or_(Ticket.titre.ilike(pattern), Ticket.description.ilike(pattern), Ticket.nom_citoyen.ilike(pattern))
        ).limit(10).all():
            results["tickets"].append({"id": t.id, "label": t.titre, "citoyen": t.nom_citoyen, "statut": t.statut})

    total = sum(len(v) for v in results.values())
    return {"query": q, "total": total, "results": results}
