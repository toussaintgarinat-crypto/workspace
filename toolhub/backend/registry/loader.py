"""RegistryLoader — auto-discovery des handlers par scan des sous-packages de registry/.

Tous les packages sous registry/ sont scannés au démarrage.
Les classes héritant de BaseToolHandler (concrètes) sont enregistrées.
La DB est synchronisée : catégories et outils manquants sont créés.
"""
from __future__ import annotations

import importlib
import logging
import pkgutil

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from registry.base import BaseToolHandler

logger = logging.getLogger(__name__)

_REGISTRY: dict[str, BaseToolHandler] = {}


def get_handler(tool_name: str) -> BaseToolHandler | None:
    return _REGISTRY.get(tool_name)


def list_handlers() -> list[BaseToolHandler]:
    return list(_REGISTRY.values())


def _discover_handler_classes() -> list[type[BaseToolHandler]]:
    """Scanne tous les sous-modules de registry/ et retourne les classes concrètes."""
    import registry as registry_pkg
    found: list[type[BaseToolHandler]] = []

    for _finder, module_name, _ispkg in pkgutil.walk_packages(
        path=registry_pkg.__path__,
        prefix=registry_pkg.__name__ + ".",
        onerror=lambda name: logger.warning("Cannot scan module %s", name),
    ):
        if module_name.endswith((".base", ".loader")):
            continue
        try:
            module = importlib.import_module(module_name)
        except Exception as exc:
            logger.warning("Failed to import %s: %s", module_name, exc)
            continue

        for attr_name in dir(module):
            obj = getattr(module, attr_name)
            if (
                isinstance(obj, type)
                and issubclass(obj, BaseToolHandler)
                and obj is not BaseToolHandler
                and not getattr(obj, "__abstractmethods__", None)
            ):
                found.append(obj)
    return found


async def init_registry(db: AsyncSession) -> None:
    """Découvre les handlers, synchronise la DB, peuple _REGISTRY."""
    from models.orm import Tool, ToolCategory

    handler_classes = _discover_handler_classes()
    logger.info("ToolHub registry: discovered %d handler classes", len(handler_classes))

    for cls in handler_classes:
        handler = cls()

        # Assure que la catégorie existe en DB
        cat_res = await db.execute(select(ToolCategory).where(ToolCategory.slug == handler.CATEGORY))
        category = cat_res.scalar_one_or_none()
        if category is None:
            category = ToolCategory(
                slug=handler.CATEGORY,
                name=handler.CATEGORY.replace("_", " ").title(),
                enabled=True,
            )
            db.add(category)
            await db.flush()

        # Assure que le tool existe en DB (upsert)
        tool_res = await db.execute(select(Tool).where(Tool.name == handler.NAME))
        tool = tool_res.scalar_one_or_none()
        if tool is None:
            tool = Tool(
                category_id=category.id,
                name=handler.NAME,
                label=handler.LABEL,
                description=handler.DESCRIPTION,
                integration_type=handler.INTEGRATION_TYPE,
                config_schema=handler.CONFIG_SCHEMA,
                cache_ttl=handler.CACHE_TTL,
                enabled=True,
            )
            db.add(tool)
        else:
            tool.label = handler.LABEL
            tool.description = handler.DESCRIPTION
            tool.config_schema = handler.CONFIG_SCHEMA
            tool.cache_ttl = handler.CACHE_TTL

        _REGISTRY[handler.NAME] = handler

    await db.commit()
    logger.info("ToolHub registry: %d handlers ready: %s", len(_REGISTRY), list(_REGISTRY.keys()))
