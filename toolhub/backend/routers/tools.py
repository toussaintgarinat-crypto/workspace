"""GET/PATCH /v1/tools — liste et activation des outils."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_admin
from db import get_db
from models.orm import Tool, ToolCategory
from models.schemas import ToolCreate, ToolOut, ToolUpdate, ToolActionOut
from registry.loader import get_handler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tools", tags=["tools"])


def _enrich_tool(tool: Tool) -> ToolOut:
    handler = get_handler(tool.name)
    actions = []
    if handler:
        for action in handler.list_actions():
            actions.append(ToolActionOut(
                name=action.name,
                description=action.description,
                parameters=action.parameters,
            ))
    out = ToolOut.model_validate(tool)
    out.actions = actions
    return out


@router.get("", response_model=list[ToolOut])
async def list_tools(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
    enabled_only: bool = True,
):
    q = select(Tool).join(ToolCategory, Tool.category_id == ToolCategory.id)
    if enabled_only:
        q = q.where(Tool.enabled.is_(True), ToolCategory.enabled.is_(True))
    result = await db.execute(q.order_by(Tool.name))
    return [_enrich_tool(t) for t in result.scalars().all()]


@router.post("", response_model=ToolOut, status_code=status.HTTP_201_CREATED)
async def create_tool(
    body: ToolCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    existing = await db.execute(select(Tool).where(Tool.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Tool '{body.name}' already exists")
    tool = Tool(**body.model_dump())
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return _enrich_tool(tool)


@router.patch("/{tool_name}", response_model=ToolOut)
async def update_tool(
    tool_name: str,
    body: ToolUpdate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(Tool).where(Tool.name == tool_name))
    tool = result.scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(tool, field, value)
    await db.commit()
    await db.refresh(tool)
    return _enrich_tool(tool)
