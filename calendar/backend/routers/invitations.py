"""Invitations à un calendrier — /calendars/{cal_id}/invitations."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models.orm import Calendar, CalendarInvitation, CalendarMember
from models.schemas import InvitationCreate, InvitationOut

router = APIRouter(tags=["invitations"])


async def _own_calendar(cal_id: str, user_id: str, db: AsyncSession) -> Calendar:
    cal = await db.get(Calendar, cal_id)
    if not cal or cal.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar not found")
    return cal


@router.get("/calendars/{cal_id}/invitations", response_model=list[InvitationOut])
async def list_invitations(
    cal_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _own_calendar(cal_id, user["sub"], db)
    result = await db.execute(
        select(CalendarInvitation).where(CalendarInvitation.calendar_id == cal_id)
    )
    return result.scalars().all()


@router.post("/calendars/{cal_id}/invitations", response_model=InvitationOut, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    cal_id: str,
    body: InvitationCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _own_calendar(cal_id, user["sub"], db)
    expires_at = None
    if body.expires_in_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)
    inv = CalendarInvitation(
        calendar_id=cal_id,
        email=body.email,
        created_by=user["sub"],
        expires_at=expires_at,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv


@router.get("/invitations/{token}", response_model=InvitationOut)
async def get_invitation(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CalendarInvitation).where(CalendarInvitation.token == token)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    return inv


@router.post("/invitations/{token}/accept", status_code=status.HTTP_200_OK)
async def accept_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(CalendarInvitation).where(CalendarInvitation.token == token)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if inv.used_at:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invitation already used")
    if inv.expires_at and datetime.now(timezone.utc) > inv.expires_at.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invitation expired")

    already = await db.execute(
        select(CalendarMember).where(
            CalendarMember.calendar_id == inv.calendar_id,
            CalendarMember.user_id == user["sub"],
        )
    )
    if not already.scalar_one_or_none():
        member = CalendarMember(calendar_id=inv.calendar_id, user_id=user["sub"], role="viewer")
        db.add(member)

    inv.used_at = datetime.now(timezone.utc)
    await db.commit()
    return {"calendar_id": inv.calendar_id}
