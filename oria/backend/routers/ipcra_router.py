"""
Sessions IPCRA — Identifier, Planifier, Créer, Réfléchir, Ajuster.
Framework de travail structuré avec support agent IA (Forge) + mémoire MemPalace.

Pattern prefetch / sync (inspiré de Hermes Agent) :
  - prefetch : avant chaque appel LLM, on interroge MemPalace pour enrichir le contexte
  - sync     : lors de chaque avancement de phase, on persiste le contenu dans MemPalace
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import httpx
import json
import time

from database import get_db
from routers.auth import get_current_user
from models.ipcra import IPCRASession, IPCRATrace
from models.agent import AgentDefinition
from models.document import Document
import mempalace_client as mp

router = APIRouter()

PHASES = ["identifier", "planifier", "creer", "reflechir", "ajuster"]


def _persist_trace(
    session_id: str, phase: str, prompt: str,
    answer: str, steps: list, agent_nom: str, duree_ms: int,
):
    """Persiste une trace VoltAgent en base (appelé en BackgroundTask)."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        trace = IPCRATrace(
            session_id=session_id,
            phase=phase,
            prompt=prompt,
            answer=answer,
            steps=json.dumps(steps, ensure_ascii=False),
            agent_nom=agent_nom,
            duree_ms=duree_ms,
        )
        db.add(trace)
        db.commit()
    finally:
        db.close()


def _phase_field(phase: str) -> str:
    return "creer_output" if phase == "creer" else f"{phase}_notes"


def _session_dict(s: IPCRASession) -> dict:
    return {
        "id": s.id, "titre": s.titre, "phase": s.phase,
        "owner_id": s.owner_id, "world_id": s.world_id, "agent_id": s.agent_id,
        "status": s.status,
        "identifier_notes": s.identifier_notes,
        "planifier_notes": s.planifier_notes,
        "creer_output": s.creer_output,
        "reflechir_notes": s.reflechir_notes,
        "ajuster_notes": s.ajuster_notes,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


# ── CRUD sessions ─────────────────────────────────────────────────

class CreateSession(BaseModel):
    titre:    str
    world_id: Optional[str] = None
    agent_id: Optional[str] = None


class UpdatePhase(BaseModel):
    content: str


@router.get("/")
def list_sessions(db: Session = Depends(get_db), user=Depends(get_current_user)):
    sessions = db.query(IPCRASession).filter_by(owner_id=user["id"]).order_by(
        IPCRASession.updated_at.desc()
    ).all()
    return [_session_dict(s) for s in sessions]


@router.post("/")
def create_session(body: CreateSession, db: Session = Depends(get_db), user=Depends(get_current_user)):
    session = IPCRASession(
        owner_id=user["id"],
        world_id=body.world_id,
        agent_id=body.agent_id,
        titre=body.titre,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    mp.create_branch(session.id)  # branche KG isolée pour cette session
    return _session_dict(session)


@router.get("/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)
    return _session_dict(s)


@router.patch("/{session_id}/phase/{phase}")
def update_phase_content(
    session_id: str, phase: str, body: UpdatePhase,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    if phase not in PHASES:
        raise HTTPException(400, f"Phase invalide. Valeurs: {PHASES}")
    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)
    setattr(s, _phase_field(phase), body.content)
    db.commit()
    db.refresh(s)
    return _session_dict(s)


@router.post("/{session_id}/advance")
def advance_phase(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)

    # Capture contenu de la phase terminée avant d'avancer
    completed_phase = s.phase
    phase_content = getattr(s, _phase_field(completed_phase), "") or ""

    idx = PHASES.index(s.phase)
    entering_ajuster = False
    if idx < len(PHASES) - 1:
        s.phase = PHASES[idx + 1]
        entering_ajuster = (s.phase == "ajuster")
    else:
        s.status = "completee"
    db.commit()
    db.refresh(s)

    # ── SYNC MemPalace ─────────────────────────────────────────────
    if phase_content.strip():
        sync_text = f"## IPCRA — {s.titre}\nPhase : {completed_phase}\n\n{phase_content}"
        background_tasks.add_task(mp.sync, sync_text, session_id, completed_phase, s.titre)

    result = _session_dict(s)

    # ── MERGE branche KG + détection contradictions à l'entrée en "ajuster"
    if entering_ajuster:
        result["merge"] = mp.merge_branch(session_id)

    return result


@router.patch("/{session_id}/status")
def update_status(
    session_id: str, status: str,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)
    if status not in ("active", "completee", "archivee"):
        raise HTTPException(400)
    s.status = status
    db.commit()
    return {"id": s.id, "status": s.status}


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)
    db.delete(s)
    db.commit()


# ── Liaison document → session IPCRA ─────────────────────────────

class AttachDocBody(BaseModel):
    doc_id: str


@router.post("/{session_id}/attach-document")
def attach_document(
    session_id: str,
    body: AttachDocBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Attache un document à une session IPCRA et l'indexe dans MemPalace
    avec le contexte de la session (session_id, session_titre).
    Utile en phase Identifier pour ingérer des documents clients.
    """
    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404, "Session IPCRA introuvable")

    doc = db.query(Document).filter_by(id=body.doc_id, owner_id=user["id"]).first()
    if not doc:
        raise HTTPException(404, "Document introuvable")
    if not doc.content_md or not doc.content_md.strip():
        raise HTTPException(400, "Document sans contenu Markdown — uploadez-le d'abord")

    doc.indexe_memory = True
    db.commit()

    background_tasks.add_task(
        mp.sync_document,
        doc.content_md, doc.id, doc.nom, user["id"], session_id, s.titre,
    )
    return {"ok": True, "doc_id": doc.id, "session_id": session_id}


# ── Traces VoltAgent ─────────────────────────────────────────────

@router.get("/{session_id}/traces")
def list_traces(
    session_id: str,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    """Retourne toutes les traces d'exécution agent pour une session IPCRA."""
    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)
    traces = (
        db.query(IPCRATrace)
        .filter_by(session_id=session_id)
        .order_by(IPCRATrace.created_at.asc())
        .all()
    )
    return [
        {
            "id": t.id,
            "phase": t.phase,
            "prompt": t.prompt,
            "answer": t.answer,
            "steps": json.loads(t.steps or "[]"),
            "agent_nom": t.agent_nom,
            "duree_ms": t.duree_ms,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in traces
    ]


# ── Contradictions KG ────────────────────────────────────────────

@router.get("/{session_id}/contradictions")
def get_contradictions(
    session_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Retourne les contradictions entre la branche KG de la session et le trunk.
    Utile pour consultation manuelle avant ou après le merge (phase ajuster).
    """
    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)
    conflicts = mp.check_contradictions(session_id)
    return {"session_id": session_id, "conflicts": conflicts, "count": len(conflicts)}


# ── Assistance IA sur une phase ───────────────────────────────────

class AssistBody(BaseModel):
    phase:  str
    prompt: str


@router.post("/{session_id}/assist")
async def ipcra_assist(
    session_id: str, body: AssistBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    """
    Demande à l'agent assigné d'assister sur la phase en cours.
    Si l'agent a use_memory=True : prefetch MemPalace et injection dans le system prompt.
    """
    if body.phase not in PHASES:
        raise HTTPException(400)

    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)

    agent = None
    if s.agent_id:
        agent = db.query(AgentDefinition).filter_by(id=s.agent_id, is_active=True).first()

    # ── PREFETCH MemPalace ─────────────────────────────────────────
    mem_block = ""
    if agent and agent.use_memory:
        query = f"{s.titre} {body.prompt}"
        hits = mp.prefetch(query, n=4)
        mem_block = mp.format_context_block(hits)

    # Contexte complet de la session
    session_ctx = f"""## Session IPCRA : {s.titre}
Phase actuelle : {s.phase}

### Identifier (contexte)
{s.identifier_notes or '—'}

### Planifier
{s.planifier_notes or '—'}

### Créer (livrable)
{s.creer_output or '—'}

### Réfléchir
{s.reflechir_notes or '—'}

### Ajuster
{s.ajuster_notes or '—'}
"""

    phase_guidance = {
        "identifier": "Tu aides à clarifier le contexte, les objectifs, les contraintes et les ressources disponibles.",
        "planifier":   "Tu aides à construire un plan d'action détaillé et structuré.",
        "creer":       "Tu aides à produire le livrable demandé, étape par étape.",
        "reflechir":   "Tu analyses ce qui a été produit de façon critique et objective. Mode avocat du diable si demandé.",
        "ajuster":     "Tu synthétises les leçons apprises et proposes des ajustements concrets pour la prochaine fois.",
    }

    system = f"""Tu es un assistant expert en méthodologie IPCRA (Identifier → Planifier → Créer → Réfléchir → Ajuster).
{phase_guidance.get(body.phase, '')}
Réponds toujours dans la langue de l'utilisateur.

{session_ctx}{mem_block}"""

    t0 = time.monotonic()

    if agent:
        forge_url = agent.forge_url.rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                r = await client.post(
                    f"{forge_url}/api/agents/react",
                    json={
                        "message": body.prompt,
                        "sessionId": f"ipcra-{session_id}-{body.phase}",
                        "systemOverride": system,
                        "provider": agent.forge_provider or None,
                        "model": agent.forge_model or None,
                    }
                )
                if r.status_code == 200:
                    data = r.json()
                    duree = int((time.monotonic() - t0) * 1000)
                    background_tasks.add_task(
                        _persist_trace,
                        session_id, body.phase, body.prompt,
                        data.get("answer", ""), data.get("steps", []),
                        agent.nom, duree,
                    )
                    return data
        except httpx.ConnectError:
            pass
        return {"answer": f"[Agent Forge non disponible sur {forge_url}]", "steps": []}

    # Pas d'agent assigné — guide textuel (on trace quand même)
    guides = {
        "identifier": "Pour cette phase, documente : 1) Le problème ou l'objectif précis 2) Les contraintes (temps, ressources) 3) Les documents/infos disponibles 4) Les parties prenantes.",
        "planifier":  "Décompose l'objectif en étapes concrètes. Pour chaque étape : action, responsable, durée estimée, dépendances.",
        "creer":      "Commence à produire le livrable. Itère par brouillons successifs. Documente tes choix.",
        "reflechir":  "Analyse : Qu'est-ce qui a bien fonctionné ? Qu'est-ce qui aurait pu être mieux ? Quels biais ont influencé les décisions ?",
        "ajuster":    "Liste les leçons apprises. Quels processus modifier ? Quelles connaissances sauvegarder dans ta mémoire ?",
    }
    answer = guides.get(body.phase, "Aucun agent assigné à cette session.")
    duree = int((time.monotonic() - t0) * 1000)
    background_tasks.add_task(
        _persist_trace,
        session_id, body.phase, body.prompt,
        answer, [], "guide-textuel", duree,
    )
    return {"answer": answer, "steps": []}


# ── Conseil LLM (multi-modèles parallèles) ───────────────────────

class ConseilBody(BaseModel):
    prompt:    str
    providers: list  # [{provider: str, model: str}]


@router.post("/{session_id}/conseil")
async def ipcra_conseil(
    session_id: str, body: ConseilBody,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    """
    Soumet un prompt à plusieurs modèles LLM en parallèle via Forge /api/conseil.
    Retourne les réponses de chaque modèle pour comparaison (Conseil LLM).
    """
    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)

    agent = None
    if s.agent_id:
        agent = db.query(AgentDefinition).filter_by(id=s.agent_id, is_active=True).first()

    if not agent:
        raise HTTPException(400, "Aucun agent Forge assigné à cette session")

    forge_url = agent.forge_url.rstrip("/")
    system = f"Tu es un expert en méthodologie IPCRA. Phase : {s.phase}. Session : {s.titre}."

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            r = await client.post(
                f"{forge_url}/api/conseil",
                json={
                    "prompt":    body.prompt,
                    "system":    system,
                    "providers": body.providers,
                }
            )
            if r.status_code == 200:
                return r.json()
    except httpx.ConnectError:
        pass
    raise HTTPException(503, f"Forge non disponible sur {forge_url}")


# ── Mode Avocat du Diable ────────────────────────────────────────

DEVIL_SYSTEM = """Tu es l'Avocat du Diable d'un processus de réflexion structuré (IPCRA).
Ton rôle : identifier les failles, biais cognitifs, angles morts et hypothèses non vérifiées dans le contenu soumis.

Tu dois retourner une réponse JSON structurée avec exactement ces 4 clés :
- "critique" : string — analyse critique principale (2-4 phrases)
- "biais" : array of strings — liste des biais cognitifs détectés (3-5 items max)
- "questions" : array of strings — questions difficiles que personne n'a posées (3-5)
- "steelman" : string — la version la plus forte de l'argument opposé (2-3 phrases)

Sois direct, sans complaisance, mais constructif."""


class DevilBody(BaseModel):
    content: str
    phase:   str


@router.post("/{session_id}/devil")
async def ipcra_devil(
    session_id: str, body: DevilBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    """
    Mode Avocat du Diable : analyse critique du contenu d'une phase IPCRA.
    Identifie biais cognitifs, angles morts, questions difficiles et steelman.
    """
    if body.phase not in PHASES:
        raise HTTPException(400)

    s = db.query(IPCRASession).filter_by(id=session_id, owner_id=user["id"]).first()
    if not s:
        raise HTTPException(404)

    agent = None
    if s.agent_id:
        agent = db.query(AgentDefinition).filter_by(id=s.agent_id, is_active=True).first()

    if not agent:
        raise HTTPException(400, "Aucun agent Forge assigné à cette session")

    prompt = f"""Analyse ce contenu de la phase "{body.phase}" de la session "{s.titre}" :

---
{body.content}
---

Identifie les failles, biais, angles morts et formule le steelman opposé.
Retourne uniquement le JSON demandé, sans texte autour."""

    forge_url = agent.forge_url.rstrip("/")
    t0 = time.monotonic()

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{forge_url}/api/agents/react",
                json={
                    "message":        prompt,
                    "sessionId":      f"devil-{session_id}-{body.phase}",
                    "systemOverride": DEVIL_SYSTEM,
                    "provider":       agent.forge_provider or None,
                    "model":          agent.forge_model or None,
                }
            )
            if r.status_code == 200:
                data = r.json()
                raw = data.get("answer", "")
                duree = int((time.monotonic() - t0) * 1000)

                # Extraction du JSON depuis la réponse
                try:
                    start = raw.index("{")
                    end   = raw.rindex("}") + 1
                    parsed = json.loads(raw[start:end])
                except (ValueError, json.JSONDecodeError):
                    parsed = {
                        "critique":  raw,
                        "biais":     [],
                        "questions": [],
                        "steelman":  "",
                    }

                background_tasks.add_task(
                    _persist_trace,
                    session_id, body.phase, f"[Avocat du Diable] {body.content[:100]}…",
                    raw, data.get("steps", []), "avocat-du-diable", duree,
                )
                return parsed
    except httpx.ConnectError:
        pass
    raise HTTPException(503, f"Forge non disponible sur {forge_url}")
