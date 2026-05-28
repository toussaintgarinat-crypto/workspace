"""NotionHandler — stub pour intégration Notion (Phase 3+)."""
from __future__ import annotations

from registry.base import BaseToolHandler, ToolAction, ToolExecutionError


class NotionHandler(BaseToolHandler):
    CATEGORY = "productivity"
    NAME = "notion"
    LABEL = "Notion"
    DESCRIPTION = "Créer et lister des pages Notion."
    INTEGRATION_TYPE = "api"
    CONFIG_SCHEMA = {
        "type": "object",
        "properties": {
            "api_key": {"type": "string", "description": "Notion Integration Token"},
            "database_id": {"type": "string", "description": "ID de la base de données Notion"},
        },
        "required": ["api_key"],
    }
    CACHE_TTL = 60

    def list_actions(self) -> list[ToolAction]:
        return [
            ToolAction(
                name="create_page",
                description="Crée une page dans une base de données Notion.",
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Titre de la page"},
                        "content": {"type": "string", "description": "Contenu Markdown"},
                    },
                    "required": ["title"],
                },
                cache_ttl=0,
            ),
            ToolAction(
                name="list_pages",
                description="Liste les pages d'une base de données Notion.",
                parameters={
                    "type": "object",
                    "properties": {
                        "page_size": {"type": "integer", "default": 10},
                    },
                    "required": [],
                },
                cache_ttl=self.CACHE_TTL,
            ),
        ]

    async def execute(self, action: str, params: dict, credentials: dict) -> dict:
        raise ToolExecutionError("Notion handler not yet implemented (stub)")
