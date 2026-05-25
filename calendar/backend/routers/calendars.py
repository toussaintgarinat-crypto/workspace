"""CRUD calendriers — /calendars."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models.orm import Calendar
from models.schemas import CalendarCreate, CalendarOut, CalendarUpdate

router = APIRouter(prefix="/calendars", tags=["calendars"])


async def _own_calendar(cal_id: str, user_id: str, db: AsyncSession) -> Calendar:
    cal = await db.get(Calendar, cal_id)
    if not cal or cal.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar not found")
    return cal


@router.get("", response_model=list[CalendarOut])
async def list_calendars(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Calendar).where(Calendar.user_id == user["sub"]))
    return result.scalars().all()


@router.post("", response_model=CalendarOut, status_code=status.HTTP_201_CREATED)
async def create_calendar(
    body: CalendarCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    cal = Calendar(**body.model_dump(), user_id=user["sub"])
    db.add(cal)
    await db.commit()
    await db.refresh(cal)
    return cal


@router.get("/{cal_id}", response_model=CalendarOut)
async def get_calendar(
    cal_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await _own_calendar(cal_id, user["sub"], db)


@router.patch("/{cal_id}", response_model=CalendarOut)
async def update_calendar(
    cal_id: str,
    body: CalendarUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    cal = await _own_calendar(cal_id, user["sub"], db)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(cal, k, v)
    await db.commit()
    await db.refresh(cal)
    return cal


@router.delete("/{cal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar(
    cal_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    cal = await _own_calendar(cal_id, user["sub"], db)
    await db.delete(cal)
    await db.commit()
