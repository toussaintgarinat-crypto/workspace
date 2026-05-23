"""Endpoint /conversation/summarize — summarize + store in MemPalace."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from config import settings
from models.schemas import SummarizeBody
from services.connections_service import resolve_active_connections
from services.llm_service import gateway_client
import summarizer as summarizer_mod

router = APIRouter(tags=["summarizer"])


@router.post("/conversation/summarize")
async def summarize_endpoint(
    body: SummarizeBody, user: dict = Depends(get_current_user)
):
    if not settings.SUMMARIZE_ENABLED:
        raise HTTPException(status_code=400, detail="Summarizer disabled")
    if not body.messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    active = await resolve_active_connections(user)
    llm_client = gateway_client(versioned=False)

    summary = await summarizer_mod.summarize_conversation(body.messages, llm_client)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    stored = await summarizer_mod.store_summary_in_mempalace(summary, active, date_str)

    return {"summary": summary, "stored": stored}
