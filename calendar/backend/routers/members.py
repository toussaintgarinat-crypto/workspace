"""Membres d'un calendrier — /calendars/{cal_id}/members."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models.orm import Calendar, CalendarMember
from models.schemas import MemberAdd, MemberOut

router = APIRouter(tags=["members"])


async def _own_calendar(cal_id: str, user_id: str, db: AsyncSession) -> Calendar:
    cal = await db.get(Calendar, cal_id)
    if not cal or cal.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar not found")
    return cal


@router.get("/calendars/{cal_id}/members", response_model=list[MemberOut])
async def list_members(
    cal_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _own_calendar(cal_id, user["sub"], db)
    result = await db.execute(
        select(CalendarMember).where(CalendarMember.calendar_id == cal_id)
    )
    return result.scalars().all()


@router.post("/calendars/{cal_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def add_member(
    cal_id: str,
    body: MemberAdd,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _own_calendar(cal_id, user["sub"], db)
    existing = await db.execute(
        select(CalendarMember).where(
            CalendarMember.calendar_id == cal_id,
            CalendarMember.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member")
    member = CalendarMember(calendar_id=cal_id, user_id=body.user_id, role=body.role)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/calendars/{cal_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    cal_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _own_calendar(cal_id, user["sub"], db)
    result = await db.execute(
        select(CalendarMember).where(
            CalendarMember.calendar_id == cal_id,
            CalendarMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await db.delete(member)
    await db.commit()
