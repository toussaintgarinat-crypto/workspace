"""
Client MemPalace pour Oria — pattern prefetch / sync.

Prefetch : avant chaque appel LLM, on récupère les souvenirs pertinents dans le palace
           et on les injecte dans le system prompt.
Sync     : lors de chaque sauvegarde IPCRA ou conversation, on persiste le contenu
           dans le palace comme entrée.

Stockage : Qdrant (local fichier ou serveur via MEMPALACE_QDRANT_URL)
Configuration :
  MEMPALACE_PALACE_PATH  → chemin du palace par défaut (~/.mempalace/palace)
  PALACE_BASE_PATH       → base des palaces par utilisateur (~/.mempalace/palaces)
  MEMPALACE_QDRANT_URL   → URL serveur Qdrant (optionnel, ex: http://qdrant:6333)
Dégradation gracieuse : si qdrant-client n'est pas installé ou si le palace n'existe pas,
                        toutes les fonctions retournent vide sans erreur.
"""

import os
import hashlib
from datetime import datetime, timezone
from pathlib import Path

PALACE_PATH = os.environ.get(
    "MEMPALACE_PALACE_PATH",
    str(Path.home() / ".mempalace" / "palace"),
)
PALACE_BASE_PATH = os.environ.get(
    "PALACE_BASE_PATH",
    str(Path.home() / ".mempalace" / "palaces"),
)
COLLECTION_NAME = "mempalace_drawers"
SIMILARITY_THRESHOLD = 0.35  # en dessous : trop éloigné, on ignore


def _get_user_palace_path(user_id: str) -> str:
    return str(Path(PALACE_BASE_PATH) / user_id)


def _get_collection(palace_path: str = None, create: bool = False):
    path = palace_path or PALACE_PATH
    try:
        from mempalace.storage import get_palace_storage  # noqa: PLC0415
        return get_palace_storage(path, create=create)
    except Exception:
        return None


def prefetch(query: str, n: int = 5, wing: str = None, user_id: str = None) -> list:
    """
    Cherche dans MemPalace les souvenirs pertinents pour la requête.
    Retourne une liste de dicts {text, wing, room, similarity}.
    Retourne [] si le palace est inaccessible.
    """
    path = _get_user_palace_path(user_id) if user_id else None
    col = _get_collection(path)
    if not col:
        return []
    try:
        kwargs = {
            "query_texts": [query],
            "n_results": min(n, col.count() or 1),
            "include": ["documents", "metadatas", "distances"],
        }
        if wing:
            kwargs["where"] = {"wing": wing}
        results = col.query(**kwargs)

        hits = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            similarity = round(1 - dist, 3)
            if similarity >= SIMILARITY_THRESHOLD:
                hits.append(
                    {
                        "text": doc,
                        "wing": meta.get("wing", "?"),
                        "room": meta.get("room", "?"),
                        "similarity": similarity,
                    }
                )
        return hits
    except Exception:
        return []


def sync(content: str, session_id: str, phase: str, titre: str, user_id: str = None) -> bool:
    """
    Persiste le contenu d'une phase IPCRA dans MemPalace.
    wing = wing_user / room = ipcra-sessions / hall = hall_events
    Retourne True si succès, False sinon (sans lever d'exception).
    """
    if not content.strip():
        return False
    path = _get_user_palace_path(user_id) if user_id else None
    col = _get_collection(path, create=True)
    if not col:
        return False
    try:
        uid = hashlib.md5(
            (content[:60] + datetime.now(timezone.utc).isoformat()).encode()
        ).hexdigest()[:14]
        drawer_id = f"ipcra_{session_id}_{phase}_{uid}"

        col.add(
            ids=[drawer_id],
            documents=[content],
            metadatas=[
                {
                    "wing": "wing_user",
                    "room": "ipcra-sessions",
                    "hall": "hall_events",
                    "source_file": f"ipcra/{session_id}/{phase}",
                    "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "added_by": "oria-ipcra",
                    "session_titre": titre,
                    "phase": phase,
                }
            ],
        )
        return True
    except Exception:
        return False


def sync_document(
    content: str,
    doc_id: str,
    doc_name: str,
    owner_id: str,
    session_id: str = None,
    session_titre: str = None,
    user_id: str = None,
) -> int:
    """
    Indexe un document (converti en Markdown) dans MemPalace par chunks.
    Découpage par paragraphes (~800 chars). Retourne le nombre de chunks ajoutés.
    """
    if not content.strip():
        return 0
    path = _get_user_palace_path(user_id) if user_id else None
    col = _get_collection(path, create=True)
    if not col:
        return 0

    # Découpage par paragraphes
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    chunks, current, current_len = [], [], 0
    for para in paragraphs:
        if current_len + len(para) > 800 and current:
            chunks.append("\n\n".join(current))
            current, current_len = [], 0
        current.append(para)
        current_len += len(para)
    if current:
        chunks.append("\n\n".join(current))

    added = 0
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for i, chunk in enumerate(chunks[:30]):  # max 30 chunks par document
        uid = hashlib.md5(f"{doc_id}_{i}_{chunk[:30]}".encode()).hexdigest()[:12]
        drawer_id = f"doc_{doc_id}_chunk{i}_{uid}"
        meta = {
            "wing": "wing_user",
            "room": "documents",
            "hall": "hall_facts",
            "source_file": doc_name,
            "date": date_str,
            "added_by": "oria-markitdown",
            "doc_id": doc_id,
            "owner_id": owner_id,
            "chunk_index": i,
        }
        if session_id:
            meta["session_id"] = session_id
        if session_titre:
            meta["session_titre"] = session_titre
        try:
            col.add(ids=[drawer_id], documents=[chunk], metadatas=[meta])
            added += 1
        except Exception:
            pass
    return added


def format_context_block(hits: list) -> str:
    """
    Formate les souvenirs récupérés en un bloc Markdown à injecter dans le system prompt.
    """
    if not hits:
        return ""
    lines = []
    for h in hits:
        snippet = h["text"][:450].strip()
        if len(h["text"]) > 450:
            snippet += "…"
        lines.append(
            f"[{h['wing']}/{h['room']} · similarité {h['similarity']}]\n{snippet}"
        )
    return "\n\n## Mémoires pertinentes (MemPalace)\n" + "\n\n---\n\n".join(lines)


# ── Branches contextuelles (isolation Git-like par session IPCRA) ─────────


def _get_kg():
    """Retourne une instance KnowledgeGraph ou None si indisponible."""
    try:
        from mempalace.knowledge_graph import KnowledgeGraph  # noqa: PLC0415
        return KnowledgeGraph()
    except Exception:
        return None


def create_branch(session_id: str) -> bool:
    """
    Crée une branche KG isolée pour une session IPCRA.
    Dégradation gracieuse si MemPalace indisponible.
    """
    kg = _get_kg()
    if not kg:
        return False
    try:
        kg.create_branch(f"ipcra_{session_id}")
        return True
    except Exception:
        return False


def merge_branch(session_id: str) -> dict:
    """
    Fusionne la branche de la session dans le trunk.
    Détecte les contradictions AVANT le merge.
    Retourne {merged: int, conflicts: list}.
    """
    kg = _get_kg()
    if not kg:
        return {"merged": 0, "conflicts": []}
    try:
        branch_name = f"ipcra_{session_id}"
        conflicts = kg.detect_contradictions(branch_name)
        merged_count = kg.merge_branch(branch_name)
        return {"merged": merged_count, "conflicts": conflicts}
    except Exception:
        return {"merged": 0, "conflicts": []}


def sync_conversation_turn(user_message: str, assistant_response: str, user_id: str) -> bool:
    """Persiste un échange (Q/R) dans le palace personnel de l'utilisateur."""
    content = f"Utilisateur : {user_message}"
    if assistant_response:
        content += f"\n\nAssistant : {assistant_response}"
    path = _get_user_palace_path(user_id)
    col = _get_collection(path, create=True)
    if not col:
        return False
    try:
        uid = hashlib.md5(
            (content[:60] + datetime.now(timezone.utc).isoformat()).encode()
        ).hexdigest()[:14]
        col.add(
            ids=[f"conv_{user_id}_{uid}"],
            documents=[content],
            metadatas=[{
                "wing": "wing_user",
                "room": "jardin-conversations",
                "hall": "hall_events",
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "added_by": "oria-jardin",
            }],
        )
        return True
    except Exception:
        return False


def check_contradictions(session_id: str) -> list:
    """
    Détecte les contradictions entre la branche session et le trunk sans merger.
    Retourne [] si MemPalace indisponible ou branche vide.
    """
    kg = _get_kg()
    if not kg:
        return []
    try:
        return kg.detect_contradictions(f"ipcra_{session_id}")
    except Exception:
        return []
