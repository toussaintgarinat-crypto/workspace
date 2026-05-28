"""POST/DELETE /v1/credentials/{tool_name} — gestion des credentials utilisateur."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from crypto import encrypt
from db import get_db
from models.orm import Tool, UserToolCredential
from models.schemas import CredentialOut, CredentialUpsert

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/credentials", tags=["credentials"])


@router.post("/{tool_name}", response_model=CredentialOut, status_code=status.HTTP_201_CREATED)
async def upsert_credential(
    tool_name: str,
    body: CredentialUpsert,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["sub"]

    result = await db.execute(select(Tool).where(Tool.name == tool_name))
    tool = result.scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

    encrypted = encrypt(json.dumps(body.credentials))

    existing = await db.execute(
        select(UserToolCredential).where(
            UserToolCredential.tool_id == tool.id,
            UserToolCredential.user_id == user_id,
        )
    )
    cred = existing.scalar_one_or_none()
    if cred:
        cred.credentials_encrypted = encrypted
        cred.enabled = True
    else:
        cred = UserToolCredential(
            user_id=user_id,
            tool_id=tool.id,
            credentials_encrypted=encrypted,
            enabled=True,
        )
        db.add(cred)

    await db.commit()
    await db.refresh(cred)
    return cred


@router.patch("/{tool_name}/toggle", response_model=CredentialOut)
async def toggle_credential(
    tool_name: str,
    enabled: bool,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["sub"]
    result = await db.execute(select(Tool).where(Tool.name == tool_name))
    tool = result.scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

    cred_result = await db.execute(
        select(UserToolCredential).where(
            UserToolCredential.tool_id == tool.id,
            UserToolCredential.user_id == user_id,
        )
    )
    cred = cred_result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="No credentials found for this tool")

    cred.enabled = enabled
    await db.commit()
    await db.refresh(cred)
    return cred


@router.delete("/{tool_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    tool_name: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["sub"]
    result = await db.execute(select(Tool).where(Tool.name == tool_name))
    tool = result.scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

    cred_result = await db.execute(
        select(UserToolCredential).where(
            UserToolCredential.tool_id == tool.id,
            UserToolCredential.user_id == user_id,
        )
    )
    cred = cred_result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="No credentials found")

    await db.delete(cred)
    await db.commit()
