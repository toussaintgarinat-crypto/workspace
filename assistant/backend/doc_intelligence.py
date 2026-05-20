import io
import json
import logging
import mimetypes
import os
import re
import tempfile

from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger(__name__)

IPCRA_WINGS = ["Input", "Projet", "Casquette", "Ressource", "Archive"]

_CTRL_RE = re.compile(r"[\x00\x01-\x08\x0B\x0C\x0E-\x1F\x7F\uD800-\uDFFF]")


def _sanitize_text(s: str) -> str:
    return _CTRL_RE.sub("", s)


async def extract_text(content: bytes, filename: str, mime_type: str | None) -> str:
    mime = mime_type or mimetypes.guess_type(filename)[0] or ""

    # Image + audio: LLM-based extraction is higher quality
    if mime.startswith("image/"):
        return await _extract_image(content, filename, mime)
    if mime.startswith("audio/") or filename.lower().endswith(
        (".mp3", ".wav", ".m4a", ".ogg", ".webm")
    ):
        return await _extract_audio(content, filename)

    # Try MarkItDown first (covers PDF, Word, Excel, PowerPoint, HTML, CSV…)
    text = _try_markitdown(content, filename)
    if text:
        return _sanitize_text(text)

    # Fallbacks for environments without MarkItDown
    if mime == "application/pdf" or filename.lower().endswith(".pdf"):
        text = _extract_pdf_text(content)
        if len(text.strip()) < 100:
            text = await _ocr_pdf(content, filename)
        return _sanitize_text(text)
    if mime in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ) or filename.lower().endswith((".docx", ".doc")):
        return _sanitize_text(_extract_docx(content))

    return _sanitize_text(content.decode("utf-8", errors="replace"))


def _try_markitdown(content: bytes, filename: str) -> str | None:
    try:
        from markitdown import MarkItDown
        suffix = os.path.splitext(filename)[1] or ".bin"
        tmp_path = None
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            result = MarkItDown().convert(tmp_path)
            text = (result.text_content or "").strip()
            return text if text else None
        finally:
            if tmp_path:
                os.unlink(tmp_path)
    except Exception:
        return None


def _extract_pdf_text(content: bytes) -> str:
    """Extract text layer only — no OCR. Returns empty string on scanned PDFs."""
    try:
        import fitz
        doc = fitz.open(stream=content, filetype="pdf")
        return "\n".join(page.get_text() for page in doc)
    except ImportError:
        pass
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    except ImportError:
        pass
    return ""


async def _ocr_pdf(content: bytes, filename: str) -> str:
    """OCR fallback — dispatches to configured OCR_PROVIDER."""
    provider = settings.OCR_PROVIDER.lower()
    logger.info("OCR fallback (%s) for %s", provider, filename)
    try:
        if provider == "mistral":
            return await _ocr_mistral(content)
        if provider == "llm":
            return await _ocr_llm(content, filename)
        return _ocr_tesseract(content, filename)
    except Exception as exc:
        logger.warning("OCR %s failed for %s: %s", provider, filename, exc)
        return ""


async def _ocr_mistral(content: bytes) -> str:
    """Mistral OCR — sends the whole PDF, returns markdown. Best for documents."""
    import base64
    import httpx
    b64 = base64.b64encode(content).decode()
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.mistral.ai/v1/ocr",
            headers={"Authorization": f"Bearer {settings.MISTRAL_API_KEY}"},
            json={
                "model": "mistral-ocr-latest",
                "document": {
                    "type": "base64_document",
                    "content": b64,
                    "document_type": "application/pdf",
                },
            },
        )
        resp.raise_for_status()
        pages = resp.json().get("pages", [])
        return "\n\n".join(p.get("markdown", "") for p in pages)


async def _ocr_llm(content: bytes, filename: str) -> str:
    """Vision via gateway — rasterizes each page and calls _extract_image()."""
    import fitz
    doc = fitz.open(stream=content, filetype="pdf")
    pages_text = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        text = await _extract_image(img_bytes, f"{filename}_p{i}.png", "image/png")
        pages_text.append(text)
    return "\n\n".join(pages_text)


def _ocr_tesseract(content: bytes, filename: str) -> str:
    """Local Tesseract OCR — no API key needed."""
    import pdf2image
    import pytesseract
    images = pdf2image.convert_from_bytes(content)
    return "\n".join(pytesseract.image_to_string(img, lang="fra+eng") for img in images)


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
