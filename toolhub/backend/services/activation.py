"""Vérification des 3 niveaux d'activation avant chaque exécution.

Niveau 1 (catégorie) : tool_categories.enabled
Niveau 2 (outil)     : tools.enabled
Niveau 3 (credential): user_tool_credentials.enabled + existence
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from crypto import decrypt
from models.orm import Tool, ToolCategory, UserToolCredential

logger = logging.getLogger(__name__)


class ActivationError(Exception):
    def __init__(self, reason: str, *, level: str):
        super().__init__(reason)
        self.level = level  # "category" | "tool" | "credential"


@dataclass
class ActivationResult:
    tool: Tool
    credentials: dict


async def check_activation(
    tool_name: str,
    user_id: str,
    db: AsyncSession,
) -> ActivationResult:
    """Valide les 3 niveaux et retourne le tool + credentials déchiffrés.

    Raises ActivationError si un niveau est désactivé ou manquant.
    """
    # Niveau 2 : outil
    tool_res = await db.execute(select(Tool).where(Tool.name == tool_name))
    tool = tool_res.scalar_one_or_none()
    if tool is None:
        raise ActivationError(f"Tool '{tool_name}' not found", level="tool")
    if not tool.enabled:
        raise ActivationError(f"Tool '{tool_name}' is disabled", level="tool")

    # Niveau 1 : catégorie
    cat_res = await db.execute(select(ToolCategory).where(ToolCategory.id == tool.category_id))
    category = cat_res.scalar_one_or_none()
    if category is None or not category.enabled:
        raise ActivationError(f"Category for tool '{tool_name}' is disabled", level="category")

    # Niveau 3 : credential utilisateur
    cred_res = await db.execute(
        select(UserToolCredential)
        .where(
            UserToolCredential.tool_id == tool.id,
            UserToolCredential.user_id == user_id,
        )
        .order_by(UserToolCredential.updated_at.desc())
        .limit(1)
    )
    credential = cred_res.scalar_one_or_none()
    if credential is None:
        raise ActivationError(
            f"No credentials configured for tool '{tool_name}' (user {user_id})",
            level="credential",
        )
    if not credential.enabled:
        raise ActivationError(
            f"Credentials for tool '{tool_name}' are disabled (user {user_id})",
            level="credential",
        )

    raw = decrypt(credential.credentials_encrypted)
    credentials = json.loads(raw)
    return ActivationResult(tool=tool, credentials=credentials)
