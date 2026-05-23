"""Conversation sync/search/delete (S59 — Cloud storage mode)."""

from fastapi import APIRouter, Depends

from auth import get_current_user
from db import (
    delete_conversation_db,
    list_conversations,
    search_conversations,
    upsert_conversation,
)
from models.schemas import ConversationSearchBody, ConversationSyncBody

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("/sync")
async def conversations_sync(
    body: ConversationSyncBody, user: dict = Depends(get_current_user)
):
    user_sub = user.get("sub", "anonymous")
    return await upsert_conversation(body.id, user_sub, body.title, body.messages)


@router.get("")
async def conversations_list(user: dict = Depends(get_current_user)):
    user_sub = user.get("sub", "anonymous")
    return await list_conversations(user_sub)


@router.post("/search")
async def conversations_search(
    body: ConversationSearchBody, user: dict = Depends(get_current_user)
):
    user_sub = user.get("sub", "anonymous")
    results = await search_conversations(body.query, user_sub, body.limit)
    return {"results": results}


@router.delete("/{conversation_id}")
async def conversations_delete(
    conversation_id: str, user: dict = Depends(get_current_user)
):
    user_sub = user.get("sub", "anonymous")
    await delete_conversation_db(conversation_id, user_sub)
    return {"deleted": conversation_id}
