"""Document upload + confirmation endpoints (doc_intelligence)."""

import logging

from fastapi import APIRouter, Depends, File, UploadFile

from auth import get_current_user
from db import get_connections
from doc_intelligence import classify_document, extract_text
from models.schemas import ConfirmUploadBody
from services.upload_service import (
    confirm_drawer_to_mempalace,
    push_document_to_mempalace,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["uploads"])


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    content = await file.read()
    filename = file.filename or "document"
    mime = file.content_type

    text = await extract_text(content, filename, mime)
    classification = await classify_document(text, filename)

    connections = await get_connections()
    mp_conn = next(
        (c for c in connections if c.get("app_type") == "mempalace" and c.get("enabled")),
        None,
    )
    file_id = None
    if mp_conn:
        file_id = await push_document_to_mempalace(
            mp_conn,
            filename,
            content,
            mime,
            wing=classification.get("wing", "Ressource"),
            room=classification.get("room", "documents"),
        )

    return {
        "file_id": file_id,
        "filename": filename,
        "size": len(content),
        "summary": classification.get("summary", ""),
        "proposed_wing": classification.get("wing", "Ressource"),
        "proposed_room": classification.get("room", "documents"),
        "confidence": classification.get("confidence", 0.5),
        "text_length": len(text),
    }


@router.post("/upload/confirm")
async def confirm_upload(
    body: ConfirmUploadBody, user: dict = Depends(get_current_user)
):
    connections = await get_connections()
    mp_conn = next(
        (c for c in connections if c.get("app_type") == "mempalace" and c.get("enabled")),
        None,
    )
    if not mp_conn:
        return {"ok": False, "error": "MemPalace non connecté"}

    ok, err = await confirm_drawer_to_mempalace(
        mp_conn,
        summary=body.summary,
        wing=body.wing,
        room=body.room,
        filename=body.filename,
        file_id=body.file_id,
    )
    return {"ok": ok} if ok else {"ok": False, "error": err}
