"""Pydantic schemas pour les modèles ToolHub."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from pydantic import BaseModel


# ── ToolCategory ────────────────────────────────────────────────────────────

class CategoryBase(BaseModel):
    name: str
    slug: str
    description: str | None = None
    enabled: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None


class CategoryOut(CategoryBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Tool ────────────────────────────────────────────────────────────────────

class ToolBase(BaseModel):
    name: str
    label: str
    description: str | None = None
    integration_type: str = "api"
    config_schema: dict | None = None
    cache_ttl: int = 0
    enabled: bool = True
    webhook_url: str | None = None


class ToolCreate(ToolBase):
    category_id: str


class ToolUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    enabled: bool | None = None
    cache_ttl: int | None = None
    webhook_url: str | None = None


class ToolActionOut(BaseModel):
    name: str
    description: str
    parameters: dict


class ToolOut(ToolBase):
    id: str
    category_id: str
    created_at: datetime
    updated_at: datetime
    actions: list[ToolActionOut] = []

    class Config:
        from_attributes = True


# ── UserToolCredential ───────────────────────────────────────────────────────

class CredentialUpsert(BaseModel):
    credentials: dict  # JSON clair, sera chiffré côté service


class CredentialOut(BaseModel):
    id: str
    tool_id: str
    user_id: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Execute ──────────────────────────────────────────────────────────────────

class ExecuteRequest(BaseModel):
    action: str
    params: dict = {}


class ExecuteResponse(BaseModel):
    result: Any
    from_cache: bool = False
    duration_ms: int = 0
