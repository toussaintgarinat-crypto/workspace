"""
Router configuration LLM par commune.
Admin only — permet de choisir le provider IA (Anthropic, OpenAI-compatible, Ollama…).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from routers.auth import get_current_user
from models.llm_config import LLMConfig
from models.world import Member
import os

router = APIRouter()

# Fallback global depuis les variables d'environnement
DEFAULT_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")
DEFAULT_BASE_URL  = os.getenv("LLM_BASE_URL", "")
DEFAULT_API_KEY   = os.getenv("LLM_API_KEY", os.getenv("ANTHROPIC_API_KEY", ""))
DEFAULT_MODEL     = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")

# Presets prêts à l'emploi (affichés dans le frontend)
PRESETS = [
    {"id": "anthropic",  "label": "Anthropic (Claude)",    "provider": "anthropic", "base_url": "", "model": "claude-haiku-4-5-20251001"},
    {"id": "openai",     "label": "OpenAI (GPT-4o)",       "provider": "openai",    "base_url": "https://api.openai.com/v1",       "model": "gpt-4o"},
    {"id": "groq",       "label": "Groq (Llama 3)",        "provider": "openai",    "base_url": "https://api.groq.com/openai/v1",  "model": "llama-3.3-70b-versatile"},
    {"id": "mistral",    "label": "Mistral AI",            "provider": "openai",    "base_url": "https://api.mistral.ai/v1",       "model": "mistral-medium-latest"},
    {"id": "together",   "label": "Together.ai",           "provider": "openai",    "base_url": "https://api.together.xyz/v1",     "model": "meta-llama/Llama-3-70b-chat-hf"},
    {"id": "ollama",     "label": "Ollama (local)",        "provider": "openai",    "base_url": "http://localhost:11434/v1",       "model": "llama3"},
    {"id": "lmstudio",   "label": "LM Studio (local)",     "provider": "openai",    "base_url": "http://localhost:1234/v1",        "model": "local-model"},
    {"id": "custom",     "label": "URL personnalisée",     "provider": "openai",    "base_url": "",                                "model": ""},
]


def _is_admin(db: Session, world_id: str, user_id: str) -> bool:
    m = db.query(Member).filter_by(world_id=world_id, user_id=user_id).first()
    return m and m.role in ("proprietaire", "admin")


def get_config_for_world(db: Session, world_id: str) -> dict:
    """Retourne la config LLM effective pour une commune (DB ou variables d'env)."""
    cfg = db.query(LLMConfig).filter_by(world_id=world_id).first()
    if cfg:
        return {
            "provider": cfg.provider,
            "base_url": cfg.base_url or _default_base_url(cfg.provider),
            "api_key":  cfg.api_key or DEFAULT_API_KEY,
            "model":    cfg.model,
        }
    return {
        "provider": DEFAULT_PROVIDER,
        "base_url": DEFAULT_BASE_URL or _default_base_url(DEFAULT_PROVIDER),
        "api_key":  DEFAULT_API_KEY,
        "model":    DEFAULT_MODEL,
    }


def _default_base_url(provider: str) -> str:
    return "" if provider == "anthropic" else "https://api.openai.com/v1"


class LLMConfigIn(BaseModel):
    provider: str          # anthropic | openai
    base_url: Optional[str] = ""
    api_key:  Optional[str] = ""
    model:    str


@router.get("/presets")
def lister_presets():
    return PRESETS


@router.get("/{world_id}")
def lire_config(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _is_admin(db, world_id, user["id"]):
        raise HTTPException(403)
    cfg = db.query(LLMConfig).filter_by(world_id=world_id).first()
    if not cfg:
        # Retourner les valeurs par défaut (env vars)
        return {
            "provider": DEFAULT_PROVIDER,
            "base_url": DEFAULT_BASE_URL,
            "api_key":  "",   # ne jamais exposer la clé env via API
            "model":    DEFAULT_MODEL,
            "source":   "env",
        }
    return {
        "provider":   cfg.provider,
        "base_url":   cfg.base_url,
        "api_key":    "***" if cfg.api_key else "",  # masqué
        "model":      cfg.model,
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None,
        "source":     "db",
    }


@router.put("/{world_id}")
def sauvegarder_config(
    world_id: str,
    body: LLMConfigIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not _is_admin(db, world_id, user["id"]):
        raise HTTPException(403)

    cfg = db.query(LLMConfig).filter_by(world_id=world_id).first()
    if cfg:
        cfg.provider   = body.provider
        cfg.base_url   = body.base_url or ""
        # Si api_key est "***" (masqué), on ne l'écrase pas
        if body.api_key and body.api_key != "***":
            cfg.api_key = body.api_key
        cfg.model      = body.model
        cfg.updated_by = user["id"]
    else:
        cfg = LLMConfig(
            world_id   = world_id,
            provider   = body.provider,
            base_url   = body.base_url or "",
            api_key    = body.api_key if body.api_key != "***" else "",
            model      = body.model,
            updated_by = user["id"],
        )
        db.add(cfg)
    db.commit()
    return {"ok": True}


@router.post("/{world_id}/test")
async def tester_config(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Envoie un prompt de test et retourne la réponse du LLM configuré."""
    if not _is_admin(db, world_id, user["id"]):
        raise HTTPException(403)
    import httpx
    cfg = get_config_for_world(db, world_id)
    provider = cfg["provider"]
    api_key  = cfg["api_key"]
    model    = cfg["model"]
    base_url = cfg["base_url"]
    prompt   = "Réponds en une phrase courte en français : tu es l'assistant IA d'une mairie, comment peux-tu aider les agents ?"

    async with httpx.AsyncClient() as client:
        try:
            if provider == "anthropic":
                if not api_key:
                    return {"response": "[Clé Anthropic manquante]"}
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": model, "max_tokens": 120, "messages": [{"role": "user", "content": prompt}]},
                    timeout=20.0,
                )
                if r.status_code == 200:
                    return {"response": r.json()["content"][0]["text"]}
                return {"response": f"Erreur {r.status_code}: {r.text[:200]}"}
            else:
                if not base_url:
                    return {"response": "[URL du provider non configurée]"}
                headers = {"content-type": "application/json"}
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"
                r = await client.post(
                    base_url.rstrip("/") + "/chat/completions",
                    headers=headers,
                    json={"model": model, "max_tokens": 120, "messages": [{"role": "user", "content": prompt}]},
                    timeout=30.0,
                )
                if r.status_code == 200:
                    return {"response": r.json()["choices"][0]["message"]["content"]}
                return {"response": f"Erreur {r.status_code}: {r.text[:200]}"}
        except httpx.ConnectError:
            return {"response": f"Connexion impossible à {base_url or provider}. Serveur démarré ?"}
        except Exception as e:
            return {"response": f"Erreur: {str(e)[:150]}"}


@router.delete("/{world_id}")
def reinitialiser_config(world_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Remet la config aux valeurs des variables d'environnement."""
    if not _is_admin(db, world_id, user["id"]):
        raise HTTPException(403)
    db.query(LLMConfig).filter_by(world_id=world_id).delete()
    db.commit()
    return {"ok": True, "message": "Config réinitialisée sur les variables d'environnement"}
