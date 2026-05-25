import json
import logging
import re
from datetime import datetime, timezone

from db import database
from config import settings

logger = logging.getLogger(__name__)

# ── Personnalités par défaut (seed au démarrage si table vide) ────────────────

_DEFAULT_PERSONALITIES = [
    {
        "key": "default",
        "label": "Par défaut",
        "emoji": "🤖",
        "description": "Comportement standard de l'assistant.",
        "system_prompt": "",
        "is_builtin": True,
    },
    {
        "key": "mentor",
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
        "is_builtin": True,
    },
    {
        "key": "expert",
        "label": "Expert Technique",
        "emoji": "⚙️",
        "description": "Réponses denses, précises, sans sur-explication.",
        "system_prompt": (
            "\n\n## Mode Expert Technique\n"
            "Tu es un expert technique senior. Va droit au but, utilise un vocabulaire technique précis, "
            "donne du code plutôt que des descriptions, cite les compromis et edge cases. "
            "Évite les introductions inutiles et les reformulations du problème."
        ),
        "is_builtin": True,
    },
    {
        "key": "brainstorm",
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
        "is_builtin": True,
    },
    {
        "key": "coach",
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
        "is_builtin": True,
    },
    {
        "key": "concis",
        "label": "Concis",
        "emoji": "⚡",
        "description": "Réponses ultra-courtes. Maximum d'info, minimum de mots.",
        "system_prompt": (
            "\n\n## Mode Concis\n"
            "Réponds toujours en moins de 5 phrases. Aucune introduction, aucune conclusion. "
            "Pas de bullet points sauf si absolument nécessaire. "
            "Priorité : information utile immédiatement actionnable."
        ),
        "is_builtin": True,
    },
    {
        "key": "analyste",
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
        "is_builtin": True,
    },
]


# ── Init tables ───────────────────────────────────────────────────────────────

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
    try:
        await database.execute(
            "ALTER TABLE user_persona ADD COLUMN assistant_personality TEXT NOT NULL DEFAULT 'default'"
        )
    except Exception:
        pass

    await database.execute("""
        CREATE TABLE IF NOT EXISTS assistant_personalities (
            key TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            emoji TEXT NOT NULL DEFAULT '🤖',
            description TEXT NOT NULL DEFAULT '',
            system_prompt TEXT NOT NULL DEFAULT '',
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)
    await _seed_personalities()


async def _seed_personalities():
    count = await database.fetch_val("SELECT COUNT(*) FROM assistant_personalities")
    if count:
        return
    now = datetime.now(timezone.utc).isoformat()
    for p in _DEFAULT_PERSONALITIES:
        await database.execute(
            """
            INSERT OR IGNORE INTO assistant_personalities
                (key, label, emoji, description, system_prompt, is_builtin, created_at)
            VALUES (:key, :label, :emoji, :description, :system_prompt, :is_builtin, :now)
            """,
            {**p, "is_builtin": int(p["is_builtin"]), "now": now},
        )


# ── Personalities CRUD ────────────────────────────────────────────────────────

def _row_to_personality(row) -> dict:
    d = dict(row)
    d["is_builtin"] = bool(d.get("is_builtin", 0))
    return d


async def get_personalities() -> list[dict]:
    rows = await database.fetch_all(
        "SELECT * FROM assistant_personalities ORDER BY is_builtin DESC, created_at ASC"
    )
    return [_row_to_personality(r) for r in rows]


async def get_personality(key: str) -> dict:
    row = await database.fetch_one(
        "SELECT * FROM assistant_personalities WHERE key = :key", {"key": key}
    )
    if not row:
        row = await database.fetch_one(
            "SELECT * FROM assistant_personalities WHERE key = 'default'"
        )
    return _row_to_personality(row) if row else {"key": "default", "system_prompt": "", "label": "Par défaut", "emoji": "🤖", "description": "", "is_builtin": True}


def _slugify(label: str) -> str:
    slug = label.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    return slug[:40].strip("_") or "custom"


async def create_personality(label: str, emoji: str, description: str, system_prompt: str) -> dict:
    base = _slugify(label)
    key = base
    i = 2
    while await database.fetch_one("SELECT key FROM assistant_personalities WHERE key = :k", {"k": key}):
        key = f"{base}_{i}"
        i += 1
    now = datetime.now(timezone.utc).isoformat()
    await database.execute(
        """
        INSERT INTO assistant_personalities (key, label, emoji, description, system_prompt, is_builtin, created_at)
        VALUES (:key, :label, :emoji, :description, :system_prompt, 0, :now)
        """,
        {"key": key, "label": label, "emoji": emoji, "description": description, "system_prompt": system_prompt, "now": now},
    )
    return await get_personality(key)


async def update_personality(key: str, label: str, emoji: str, description: str, system_prompt: str) -> dict:
    row = await database.fetch_one("SELECT key FROM assistant_personalities WHERE key = :key", {"key": key})
    if not row:
        raise ValueError(f"Personnalité '{key}' introuvable.")
    await database.execute(
        """
        UPDATE assistant_personalities
        SET label = :label, emoji = :emoji, description = :description, system_prompt = :system_prompt
        WHERE key = :key
        """,
        {"key": key, "label": label, "emoji": emoji, "description": description, "system_prompt": system_prompt},
    )
    return await get_personality(key)


async def delete_personality(key: str) -> None:
    if key == "default":
        raise ValueError("La personnalité 'default' ne peut pas être supprimée.")
    await database.execute("DELETE FROM assistant_personalities WHERE key = :key", {"key": key})
    # Remettre les utilisateurs qui avaient cette personnalité sur 'default'
    await database.execute(
        "UPDATE user_persona SET assistant_personality = 'default' WHERE assistant_personality = :key",
        {"key": key},
    )


# ── User persona CRUD ─────────────────────────────────────────────────────────

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
    mp_conn = next(
        (c for c in active_connections if c.get("app_type") == "mempalace" and c.get("enabled")),
        None,
    )
    if not mp_conn:
        return
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
        logger.warning("Persona sync to MemPalace failed: %s", e)


async def infer_from_conversation(messages: list, user_sub: str, llm_client) -> dict:
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


# ── System prompt builder ─────────────────────────────────────────────────────

def build_persona_context(persona: dict, personality: dict | None = None) -> str:
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

    if personality:
        result += personality.get("system_prompt", "")

    return result
