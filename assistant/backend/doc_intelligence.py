import io
import json
import logging
import mimetypes
import os
import tempfile

from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger(__name__)

IPCRA_WINGS = ["Input", "Projet", "Casquette", "Ressource", "Archive"]


async def extract_text(content: bytes, filename: str, mime_type: str | None) -> str:
    mime = mime_type or mimetypes.guess_type(filename)[0] or ""

    if mime == "application/pdf" or filename.lower().endswith(".pdf"):
        return _extract_pdf(content)

    if mime in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ) or filename.lower().endswith((".docx", ".doc")):
        return _extract_docx(content)

    if mime.startswith("image/"):
        return await _extract_image(content, filename, mime)

    if mime.startswith("audio/") or filename.lower().endswith(
        (".mp3", ".wav", ".m4a", ".ogg", ".webm")
    ):
        return await _extract_audio(content, filename)

    return content.decode("utf-8", errors="replace")


def _extract_pdf(content: bytes) -> str:
    try:
        import fitz
        doc = fitz.open(stream=content, filetype="pdf")
        return "\n".join(page.get_text() for page in doc)
    except ImportError:
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            return "\n".join(p.extract_text() or "" for p in reader.pages)
        except ImportError:
            return content.decode("utf-8", errors="replace")


def _extract_docx(content: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


async def _extract_image(content: bytes, filename: str, mime: str) -> str:
    import base64
    b64 = base64.b64encode(content).decode()
    client = _llm_client()
    resp = await client.chat.completions.create(
        model=settings.GATEWAY_MODEL,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Décris et transcris intégralement le contenu de cette image.",
                },
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64}"},
                },
            ],
        }],
    )
    return resp.choices[0].message.content or ""


async def _extract_audio(content: bytes, filename: str) -> str:
    client = _llm_client()
    suffix = os.path.splitext(filename)[1] or ".mp3"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        with open(tmp_path, "rb") as f:
            resp = await client.audio.transcriptions.create(model="whisper-1", file=f)
        return resp.text
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


async def classify_document(text: str, filename: str) -> dict:
    client = _llm_client()
    preview = text[:3000]
    # Sanitize filename: strip control characters and limit length to prevent prompt injection
    safe_filename = "".join(c for c in filename if c.isprintable())[:256]
    resp = await client.chat.completions.create(
        model=settings.GATEWAY_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Tu es un assistant de classification documentaire utilisant le système IPCRA.\n"
                    "IPCRA : Input (info brute à traiter), Projet (travail en cours), "
                    "Casquette (rôle/expertise), Ressource (référence utile), Archive (passé/terminé).\n"
                    "Réponds UNIQUEMENT avec ce JSON (pas de markdown) :\n"
                    '{"wing":"<catégorie>","room":"<sous-cat en kebab-case max 32 chars>",'
                    '"summary":"<résumé 2-3 phrases>","confidence":<0.0-1.0>}'
                ),
            },
            {
                "role": "user",
                "content": f"Fichier : {safe_filename}\n\nContenu :\n{preview}",
            },
        ],
        temperature=0.2,
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        data = json.loads(raw)
        if data.get("wing") not in IPCRA_WINGS:
            data["wing"] = "Ressource"
        return data
    except Exception:
        return {
            "wing": "Ressource",
            "room": "documents",
            "summary": raw[:300],
            "confidence": 0.5,
        }


def _llm_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=settings.GATEWAY_API_KEY,
        base_url=f"{settings.GATEWAY_URL}/v1",
    )
