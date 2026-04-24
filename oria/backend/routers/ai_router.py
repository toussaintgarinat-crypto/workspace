"""
Router IA municipale — Résumé de séances + suggestions de réponses tickets.
Supporte Anthropic, OpenAI-compatible (Ollama, LM Studio, Groq, Together, Mistral…).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from routers.auth import get_current_user
from routers.llm_config_router import get_config_for_world
from models.mairie import ConseilMunicipal, Ticket
from models.world import Member
import httpx

router = APIRouter()


def _is_member(db: Session, world_id: str, user_id: str) -> bool:
    return bool(db.query(Member).filter_by(world_id=world_id, user_id=user_id).first())


async def call_llm(prompt: str, world_id: str, db: Session, max_tokens: int = 400) -> str:
    """
    Appel unifié au LLM configuré pour la commune.
    - provider == "anthropic" → API Anthropic (format messages)
    - provider == "openai"    → API OpenAI-compatible (Ollama, LM Studio, Groq, Together, Mistral…)
    """
    cfg = get_config_for_world(db, world_id)
    provider = cfg["provider"]
    api_key  = cfg["api_key"]
    model    = cfg["model"]
    base_url = cfg["base_url"]

    if not api_key and provider != "openai":
        return "[IA non disponible — configurer une clé API dans les paramètres de la commune]"

    async with httpx.AsyncClient() as client:
        try:
            if provider == "anthropic":
                url = "https://api.anthropic.com/v1/messages"
                r = await client.post(
                    url,
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": max_tokens,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                    timeout=30.0,
                )
                if r.status_code == 200:
                    return r.json()["content"][0]["text"]
                return f"[Erreur Anthropic {r.status_code}: {r.text[:200]}]"

            else:  # openai-compatible (Ollama, LM Studio, Groq, Together, Mistral…)
                if not base_url:
                    return "[URL du provider LLM non configurée]"
                url = base_url.rstrip("/") + "/chat/completions"
                headers = {"content-type": "application/json"}
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"
                r = await client.post(
                    url,
                    headers=headers,
                    json={
                        "model": model,
                        "max_tokens": max_tokens,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                    timeout=60.0,  # plus long pour les modèles locaux
                )
                if r.status_code == 200:
                    return r.json()["choices"][0]["message"]["content"]
                return f"[Erreur LLM {r.status_code}: {r.text[:200]}]"

        except httpx.ConnectError:
            return f"[Connexion impossible au LLM ({base_url or provider}). Vérifier que le serveur est démarré.]"
        except Exception as e:
            return f"[Erreur IA: {str(e)[:150]}]"


class SummarizeConseilBody(BaseModel):
    conseil_id: str
    world_id: str


class SuggestResponseBody(BaseModel):
    ticket_id: str
    world_id: str


@router.post("/summarize-conseil")
async def summarize_conseil(
    body: SummarizeConseilBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Génère un résumé structuré de l'ordre du jour d'un conseil municipal."""
    if not _is_member(db, body.world_id, user["id"]):
        raise HTTPException(403)
    conseil = db.query(ConseilMunicipal).get(body.conseil_id)
    if not conseil or conseil.world_id != body.world_id:
        raise HTTPException(404)

    prompt = (
        f"Tu es un assistant municipal. Voici l'ordre du jour d'un conseil municipal "
        f"prévu le {conseil.date_conseil} à {conseil.heure} ({conseil.lieu}).\n\n"
        f"ORDRE DU JOUR :\n{conseil.ordre_du_jour or '(non renseigné)'}\n\n"
        f"Génère un résumé structuré en 3-5 points clés, rédigé dans un style administratif "
        f"formel mais accessible aux citoyens. Réponds en français."
    )
    resume = await call_llm(prompt, body.world_id, db, max_tokens=500)
    return {"resume": resume}


@router.post("/suggest-ticket-response")
async def suggest_ticket_response(
    body: SuggestResponseBody,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Suggère une réponse administrative à un ticket citoyen."""
    if not _is_member(db, body.world_id, user["id"]):
        raise HTTPException(403)
    ticket = db.query(Ticket).get(body.ticket_id)
    if not ticket or ticket.world_id != body.world_id:
        raise HTTPException(404)

    prompt = (
        f"Tu es un agent municipal chargé de répondre aux demandes des citoyens. "
        f"Voici une demande reçue :\n\n"
        f"TYPE : {ticket.type_demande}\n"
        f"TITRE : {ticket.titre}\n"
        f"DESCRIPTION : {ticket.description or '(non fournie)'}\n\n"
        f"Rédige une réponse officielle, courtoise et constructive en 2-4 phrases. "
        f"Indique les prochaines étapes si applicable. Réponds en français."
    )
    suggestion = await call_llm(prompt, body.world_id, db, max_tokens=350)
    return {"suggestion": suggestion}
