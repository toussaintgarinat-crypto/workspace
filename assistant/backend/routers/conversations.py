"""Conversation sync/search/delete (S59) + folders + tags (S113)."""

from fastapi import APIRouter, Depends, Query

from auth import get_current_user
from db import (
    add_conversation_tag,
    create_folder,
    delete_conversation_db,
    delete_folder,
    list_conversations,
    list_folders,
    remove_conversation_tag,
    search_conversations,
    set_conversation_folder,
    update_folder,
    upsert_conversation,
)
from models.schemas import (
    ConversationFolderBody,
    ConversationSearchBody,
    ConversationSyncBody,
    ConversationTagBody,
    FolderBody,
    FolderUpdateBody,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


# ── Existing endpoints (S59) ──────────────────────────────────────────────────

@router.post("/sync")
async def conversations_sync(
    body: ConversationSyncBody, user: dict = Depends(get_current_user)
):
    user_sub = user.get("sub", "anonymous")
    return await upsert_conversation(body.id, user_sub, body.title, body.messages)


@router.get("")
async def conversations_list(
    folder_id: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    user_sub = user.get("sub", "anonymous")
    return await list_conversations(user_sub, folder_id=folder_id)


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


# ── Folders (S113) ────────────────────────────────────────────────────────────

@router.post("/folders")
async def folders_create(body: FolderBody, user: dict = Depends(get_current_user)):
    user_sub = user.get("sub", "anonymous")
    return await create_folder(user_sub, body.name, body.parent_id)


@router.get("/folders")
async def folders_list(user: dict = Depends(get_current_user)):
    user_sub = user.get("sub", "anonymous")
    return await list_folders(user_sub)


@router.patch("/folders/{folder_id}")
async def folders_update(
    folder_id: str, body: FolderUpdateBody, user: dict = Depends(get_current_user)
):
    user_sub = user.get("sub", "anonymous")
    return await update_folder(folder_id, user_sub, body.name)


@router.delete("/folders/{folder_id}")
async def folders_delete(folder_id: str, user: dict = Depends(get_current_user)):
    user_sub = user.get("sub", "anonymous")
    await delete_folder(folder_id, user_sub)
    return {"deleted": folder_id}


# ── Conversation → folder assignment (S113) ───────────────────────────────────

@router.patch("/{conversation_id}/folder")
async def conversation_set_folder(
    conversation_id: str,
    body: ConversationFolderBody,
    user: dict = Depends(get_current_user),
):
    user_sub = user.get("sub", "anonymous")
    await set_conversation_folder(conversation_id, user_sub, body.folder_id)
    return {"conversation_id": conversation_id, "folder_id": body.folder_id}


# ── Tags (S113) ───────────────────────────────────────────────────────────────

@router.post("/{conversation_id}/tags")
async def conversation_add_tag(
    conversation_id: str,
    body: ConversationTagBody,
    user: dict = Depends(get_current_user),
):
    user_sub = user.get("sub", "anonymous")
    await add_conversation_tag(conversation_id, user_sub, body.tag)
    return {"conversation_id": conversation_id, "tag": body.tag.strip().lower()}


@router.delete("/{conversation_id}/tags/{tag}")
async def conversation_remove_tag(
    conversation_id: str,
    tag: str,
    user: dict = Depends(get_current_user),
):
    user_sub = user.get("sub", "anonymous")
    await remove_conversation_tag(conversation_id, user_sub, tag)
    return {"conversation_id": conversation_id, "removed": tag}
