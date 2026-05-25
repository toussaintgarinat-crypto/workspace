import json
import logging
from datetime import datetime, timezone

from db import database
from config import settings

logger = logging.getLogger(__name__)

# ── Personnalités prédéfinies de l'assistant ─────────────────────────────────

PERSONALITIES: dict[str, dict] = {
    "default": {
        "label": "Par défaut",
        "emoji": "🤖",
        "description": "Comportement standard de l'assistant.",
        "system_prompt": "",
    },
    "mentor": {
        "label": "Mentor",
        "emoji": "🎓",
        "description": "Explique, guide, encourage. Idéal pour apprendre.",
        "system_prompt": (
            "\n\n## Mode Mentor\n"
            "Tu es un mentor bienveillant et pédagogue. Explique les concepts étape par étape, "
            "utilise des analogies, pose des questions pour vérifier la compréhension, "
            "et encourage l'utilisateur dans sa progression. "
            "Commence par évaluer le niveau avant de répondre."
        ),
    },
    "expert": {
        "label": "Expert Technique",
        "emoji": "⚙️",
        "description": "Réponses denses, précises, sans sur-explication.",
        "system_prompt": (
            "\n\n## Mode Expert Technique\n"
            "Tu es un expert technique senior. Va droit au but, utilise un vocabulaire technique précis, "
            "donne du code plutôt que des descriptions, cite les compromis et edge cases. "
            "Évite les introductions inutiles et les reformulations du problème."
        ),
    },
    "brainstorm": {
        "label": "Brainstorming",
        "emoji": "💡",
        "description": "Génère des idées créatives, divergentes, sans filtre.",
        "system_prompt": (
            "\n\n## Mode Brainstorming\n"
            "Tu es un facilitateur créatif. Génère un maximum d'idées variées et originales, "
            "y compris les plus inhabituelles. Ne juge pas les idées, ne les filtre pas — quantité "
            "d'abord. Structure-les en catégories si elles sont nombreuses. "
            "Propose aussi des combinaisons inattendues."
        ),
    },
    "coach": {
        "label": "Coach",
        "emoji": "🏆",
        "description": "Aide à clarifier les objectifs, débloquer, décider.",
        "system_prompt": (
            "\n\n## Mode Coach\n"
            "Tu es un coach personnel orienté action. Pose des questions puissantes pour aider "
            "l'utilisateur à clarifier ses objectifs et lever ses blocages. "
            "Reformule ce que tu entends, identifie les hypothèses implicites, "
            "propose des actions concrètes et mesurables. Ne donne pas de réponses toutes faites."
        ),
    },
    "concis": {
        "label": "Concis",
        "emoji": "⚡",
        "description": "Réponses ultra-courtes. Maximum d'info, minimum de mots.",
        "system_prompt": (
            "\n\n## Mode Concis\n"
            "Réponds toujours en moins de 5 phrases. Aucune introduction, aucune conclusion. "
            "Pas de bullet points sauf si absolument nécessaire. "
            "Priorité : information utile immédiatement actionnable."
        ),
    },
    "analyste": {
        "label": "Analyste",
        "emoji": "🔍",
        "description": "Décompose les problèmes, identifie les risques, structure l'analyse.",
        "system_prompt": (
            "\n\n## Mode Analyste\n"
            "Tu es un analyste rigoureux. Décompose chaque problème en sous-parties, "
            "identifie les hypothèses, évalue les risques et incertitudes, "
            "présente des scénarios alternatifs. Structure toujours ta réponse : "
            "contexte → analyse → conclusions → recommandations."
        ),
    },
}


async def init_persona_table():
    await database.execute("""
        CREATE TABLE IF NOT EXISTS user_persona (
            user_sub TEXT PRIMARY KEY,
            display_name TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT '',
            expertise_domains TEXT NOT NULL DEFAULT '[]',
            tone TEXT NOT NULL DEFAULT 'casual',
            language TEXT NOT NULL DEFAULT 'fr-FR',
            custom_instructions TEXT NOT NULL DEFAULT '',
            inferred_data TEXT NOT NULL DEFAULT '{}',
            assistant_personality TEXT NOT NULL DEFAULT 'default',
            updated_at TEXT NOT NULL
        )
    """)
    # Migration: add column if it doesn't exist yet (SQLite compatible)
    try:
        await database.execute(
            "ALTER TABLE user_persona ADD COLUMN assistant_personality TEXT NOT NULL DEFAULT 'default'"
        )
    except Exception:
        pass


async def get_persona(user_sub: str) -> dict:
    row = await database.fetch_one(
        "SELECT * FROM user_persona WHERE user_sub = :sub",
        {"sub": user_sub},
    )
    if not row:
        return {}
    d = dict(row)
    d["expertise_domains"] = json.loads(d.get("expertise_domains") or "[]")
    d["inferred_data"] = json.loads(d.get("inferred_data") or "{}")
    if not d.get("assistant_personality"):
        d["assistant_personality"] = "default"
    return d


async def upsert_persona(user_sub: str, **fields) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    existing = await get_persona(user_sub)
    merged = {
        "display_name": existing.get("display_name", ""),
        "role": existing.get("role", ""),
        "expertise_domains": existing.get("expertise_domains", []),
        "tone": existing.get("tone", "casual"),
        "language": existing.get("language", "fr-FR"),
        "custom_instructions": existing.get("custom_instructions", ""),
        "inferred_data": existing.get("inferred_data", {}),
        "assistant_personality": existing.get("assistant_personality", "default"),
    }
    for k, v in fields.items():
        if k in merged:
            merged[k] = v

    await database.execute(
        """
        INSERT INTO user_persona
            (user_sub, display_name, role, expertise_domains, tone, language,
             custom_instructions, inferred_data, assistant_personality, updated_at)
        VALUES (:user_sub, :display_name, :role, :expertise_domains, :tone, :language,
                :custom_instructions, :inferred_data, :assistant_personality, :now)
        ON CONFLICT (user_sub) DO UPDATE SET
            display_name = excluded.display_name,
            role = excluded.role,
            expertise_domains = excluded.expertise_domains,
            tone = excluded.tone,
            language = excluded.language,
            custom_instructions = excluded.custom_instructions,
            inferred_data = excluded.inferred_data,
            assistant_personality = excluded.assistant_personality,
            updated_at = excluded.updated_at
        """,
        {
            "user_sub": user_sub,
            "display_name": merged["display_name"],
            "role": merged["role"],
            "expertise_domains": json.dumps(merged["expertise_domains"], ensure_ascii=False),
            "tone": merged["tone"],
            "language": merged["language"],
            "custom_instructions": merged["custom_instructions"],
            "inferred_data": json.dumps(merged["inferred_data"], ensure_ascii=False),
            "assistant_personality": merged["assistant_personality"],
            "now": now,
        },
    )
    return await get_persona(user_sub)


async def sync_to_mempalace(persona: dict, active_connections: list):
    """Push persona snapshot to MemPalace as a Ressource drawer."""
    mp_conn = next(
        (c for c in active_connections if c.get("app_type") == "mempalace" and c.get("enabled")),
        None,
    )
    if not mp_conn:
        return
    # S99 : S2SClient pour MemPalace (retry + circuit breaker).
    from agent_personnel_shared.http_client import S2SClient, S2SError
    content = (
        "# Persona utilisateur\n"
        f"**Nom :** {persona.get('display_name', '')}\n"
        f"**Rôle :** {persona.get('role', '')}\n"
        f"**Domaines :** {', '.join(persona.get('expertise_domains', []))}\n"
        f"**Ton :** {persona.get('tone', '')}\n"
        f"**Langue :** {persona.get('language', '')}\n"
        f"**Instructions :** {persona.get('custom_instructions', '')}\n"
    )
    client = S2SClient(
        base_url=mp_conn["url"],
        token=mp_conn.get("token"),
        service_name="mempalace",
        timeout=10.0,
    )
    try:
        await client.post(
            "/v1/api/drawers",
            json={
                "content": content,
                "wing": "ressource",
                "room": "persona",
                "metadata": {"type": "persona"},
            },
        )
    except S2SError as e:
        # Fire-and-forget : on log mais on continue (la persona reste en DB locale).
        logger.warning("Persona sync to MemPalace failed: %s", e)


async def infer_from_conversation(messages: list, user_sub: str, llm_client) -> dict:
    """Analyze last N user messages to infer persona fields. Fire-and-forget."""
    user_messages = [m for m in messages if m.get("role") == "user"]
    if len(user_messages) < 3:
        return {}

    sample = "\n".join(f"User: {m['content'][:250]}" for m in user_messages[-8:])
    prompt = (
        "Analyse ces messages utilisateur et extrais des informations de profil.\n"
        "Réponds UNIQUEMENT en JSON (sans markdown) avec ces champs (laisse vide si inconnu) :\n"
        '{"role":"","expertise_domains":[],"tone":"casual|formal|technical|friendly","language":""}\n\n'
        f"Messages :\n{sample}"
    )

    try:
        resp = await llm_client.chat.completions.create(
            model=settings.GATEWAY_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            stream=False,
        )
        raw = resp.choices[0].message.content or ""
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start < 0 or end <= start:
            return {}
        inferred = json.loads(raw[start:end])
        update: dict = {}
        if inferred.get("role"):
            update["role"] = inferred["role"]
        if isinstance(inferred.get("expertise_domains"), list) and inferred["expertise_domains"]:
            update["expertise_domains"] = inferred["expertise_domains"][:8]
        if inferred.get("tone") in ("casual", "formal", "technical", "friendly"):
            update["tone"] = inferred["tone"]
        if inferred.get("language"):
            update["language"] = inferred["language"]
        if update:
            update["inferred_data"] = inferred
            await upsert_persona(user_sub, **update)
        return update
    except Exception as e:
        logger.warning("Persona inference failed: %s", e)
        return {}


def build_persona_context(persona: dict) -> str:
    if not persona:
        return ""
    parts: list[str] = []
    if persona.get("display_name"):
        parts.append(f"L'utilisateur s'appelle {persona['display_name']}.")
    if persona.get("role"):
        parts.append(f"Son rôle : {persona['role']}.")
    if persona.get("expertise_domains"):
        parts.append(f"Domaines d'expertise : {', '.join(persona['expertise_domains'])}.")
    tone = persona.get("tone", "casual")
    if tone == "formal":
        parts.append("Utilise un ton formel et professionnel.")
    elif tone == "technical":
        parts.append("Utilise un langage technique et précis, sans sur-expliquer les concepts connus.")
    elif tone == "friendly":
        parts.append("Sois chaleureux, encourageant et accessible.")
    if persona.get("language"):
        parts.append(f"Langue préférée : {persona['language']}.")
    if persona.get("custom_instructions"):
        parts.append(f"Instructions personnalisées : {persona['custom_instructions']}")

    result = ""
    if parts:
        result = "\n\n## Profil utilisateur\n" + "\n".join(parts)

    personality_key = persona.get("assistant_personality", "default")
    personality = PERSONALITIES.get(personality_key, PERSONALITIES["default"])
    result += personality["system_prompt"]

    return result


def get_personalities() -> list[dict]:
    return [
        {"key": k, "label": v["label"], "emoji": v["emoji"], "description": v["description"]}
        for k, v in PERSONALITIES.items()
    ]
