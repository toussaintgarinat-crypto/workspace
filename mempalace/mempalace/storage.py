"""
storage.py — Qdrant backend pour MemPalace.

Remplace chromadb.PersistentClient + collection par une API identique.
Permet d'utiliser le même serveur Qdrant que Forge (cohérence de stack).

Modes :
  Local (défaut) : QdrantClient(path=palace_path + "/.qdrant")
  Serveur        : MEMPALACE_QDRANT_URL=http://qdrant:6333

Embeddings : fastembed BAAI/bge-small-en-v1.5 (384 dim, même que all-MiniLM-L6-v2)

API identique à chromadb.Collection :
  collection.add(ids, documents, metadatas)
  collection.get(where=None, limit=None, include=None, ids=None)
  collection.query(query_texts, n_results, where=None, include=None)
  collection.update(ids, metadatas)
  collection.count() → int
"""

from __future__ import annotations

import os
import uuid
import hashlib
from pathlib import Path
from typing import Any

COLLECTION_NAME = "mempalace_drawers"
VECTOR_SIZE = 384
QDRANT_URL = os.environ.get("MEMPALACE_QDRANT_URL", "")

_embed_model = None


def _get_embedder():
    global _embed_model
    if _embed_model is None:
        from fastembed import TextEmbedding
        _embed_model = TextEmbedding("BAAI/bge-small-en-v1.5")
    return _embed_model


def _embed(texts: list[str]) -> list[list[float]]:
    return [v.tolist() for v in _get_embedder().embed(texts)]


def _str_id(s: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, s))


def _chroma_where_to_qdrant(where: dict | None):
    if not where:
        return None
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    def _condition(key: str, val) -> FieldCondition:
        return FieldCondition(key=key, match=MatchValue(value=val))

    if "$and" in where:
        must = [_condition(list(c.keys())[0], list(c.values())[0]) for c in where["$and"]]
        return Filter(must=must)
    key, val = next(iter(where.items()))
    return Filter(must=[_condition(key, val)])


class QdrantCollection:
    """API compatible chromadb.Collection au-dessus de qdrant_client."""

    def __init__(self, client, name: str):
        self._client = client
        self._name = name

    # ── add ──────────────────────────────────────────────────────

    def add(self, ids: list, documents: list, metadatas: list) -> None:
        from qdrant_client.models import PointStruct
        vectors = _embed(documents)
        points = []
        for sid, doc, meta, vec in zip(ids, documents, metadatas, vectors):
            payload = dict(meta)
            payload["_text"] = doc
            payload["_original_id"] = sid
            points.append(PointStruct(id=_str_id(sid), vector=vec, payload=payload))
        self._client.upsert(collection_name=self._name, points=points)

    # ── get ───────────────────────────────────────────────────────

    def get(
        self,
        ids: list | None = None,
        where: dict | None = None,
        limit: int | None = None,
        include: list | None = None,
    ) -> dict:
        from qdrant_client.models import Filter, HasIdCondition

        scroll_filter = _chroma_where_to_qdrant(where)

        if ids:
            id_filter = Filter(must=[HasIdCondition(has_id=[_str_id(i) for i in ids])])
            if scroll_filter:
                from qdrant_client.models import Filter as QFilter
                scroll_filter = QFilter(must=(scroll_filter.must or []) + (id_filter.must or []))
            else:
                scroll_filter = id_filter

        all_points, all_ids, all_docs, all_metas = [], [], [], []
        offset = None
        batch = min(limit or 1000, 1000)

        while True:
            results, next_offset = self._client.scroll(
                collection_name=self._name,
                scroll_filter=scroll_filter,
                limit=batch,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
            for pt in results:
                all_ids.append(pt.payload.get("_original_id", str(pt.id)))
                all_docs.append(pt.payload.get("_text", ""))
                meta = {k: v for k, v in pt.payload.items() if not k.startswith("_")}
                all_metas.append(meta)

            if next_offset is None or (limit and len(all_ids) >= limit):
                break
            offset = next_offset

        if limit:
            all_ids, all_docs, all_metas = all_ids[:limit], all_docs[:limit], all_metas[:limit]

        result: dict = {"ids": all_ids}
        inc = include or ["documents", "metadatas"]
        if "documents" in inc:
            result["documents"] = all_docs
        if "metadatas" in inc:
            result["metadatas"] = all_metas
        return result

    # ── query ─────────────────────────────────────────────────────

    def query(
        self,
        query_texts: list,
        n_results: int = 5,
        where: dict | None = None,
        include: list | None = None,
    ) -> dict:
        vec = _embed([query_texts[0]])[0]
        qfilter = _chroma_where_to_qdrant(where)

        hits = self._client.search(
            collection_name=self._name,
            query_vector=vec,
            limit=n_results,
            query_filter=qfilter,
            with_payload=True,
            score_threshold=None,
        )

        ids, docs, metas, distances = [], [], [], []
        for h in hits:
            ids.append(h.payload.get("_original_id", str(h.id)))
            docs.append(h.payload.get("_text", ""))
            meta = {k: v for k, v in h.payload.items() if not k.startswith("_")}
            metas.append(meta)
            # ChromaDB distances sont 1 - cosine_similarity; Qdrant retourne cosine_similarity
            distances.append(1 - h.score)

        return {
            "ids": [ids],
            "documents": [docs],
            "metadatas": [metas],
            "distances": [distances],
        }

    # ── update ────────────────────────────────────────────────────

    def update(self, ids: list, metadatas: list) -> None:
        for sid, meta in zip(ids, metadatas):
            self._client.set_payload(
                collection_name=self._name,
                payload=meta,
                points=[_str_id(sid)],
            )

    # ── delete ───────────────────────────────────────────────────

    def delete(self, ids: list[str]) -> None:
        from qdrant_client.models import PointIdsList
        self._client.delete(
            collection_name=self._name,
            points_selector=PointIdsList(points=[_str_id(i) for i in ids]),
        )

    # ── count ─────────────────────────────────────────────────────

    def count(self) -> int:
        result = self._client.count(collection_name=self._name, exact=False)
        return result.count


def get_palace_storage(palace_path: str, create: bool = True) -> QdrantCollection | None:
    """
    Retourne une QdrantCollection pour le palace donné.
    Utilise MEMPALACE_QDRANT_URL si défini, sinon mode fichier local.
    Retourne None si indisponible et create=False.
    """
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams

        if QDRANT_URL:
            client = QdrantClient(url=QDRANT_URL)
        else:
            qdrant_path = str(Path(palace_path) / ".qdrant")
            Path(qdrant_path).mkdir(parents=True, exist_ok=True)
            client = QdrantClient(path=qdrant_path)

        collections = {c.name for c in client.get_collections().collections}
        if COLLECTION_NAME not in collections:
            if not create:
                return None
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )

        return QdrantCollection(client, COLLECTION_NAME)

    except Exception:
        return None
