"""HubSpotHandler — stub pour intégration HubSpot CRM (Phase 3+)."""
from __future__ import annotations

from registry.base import BaseToolHandler, ToolAction, ToolExecutionError


class HubSpotHandler(BaseToolHandler):
    CATEGORY = "crm"
    NAME = "hubspot"
    LABEL = "HubSpot"
    DESCRIPTION = "Créer et lister des contacts HubSpot."
    INTEGRATION_TYPE = "api"
    CONFIG_SCHEMA = {
        "type": "object",
        "properties": {
            "api_key": {"type": "string", "description": "HubSpot Private App Token"},
        },
        "required": ["api_key"],
    }
    CACHE_TTL = 120

    def list_actions(self) -> list[ToolAction]:
        return [
            ToolAction(
                name="create_contact",
                description="Crée un contact dans HubSpot CRM.",
                parameters={
                    "type": "object",
                    "properties": {
                        "email": {"type": "string", "description": "Email du contact"},
                        "firstname": {"type": "string"},
                        "lastname": {"type": "string"},
                    },
                    "required": ["email"],
                },
                cache_ttl=0,
            ),
            ToolAction(
                name="list_contacts",
                description="Liste les contacts HubSpot.",
                parameters={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 20},
                    },
                    "required": [],
                },
                cache_ttl=self.CACHE_TTL,
            ),
        ]

    async def execute(self, action: str, params: dict, credentials: dict) -> dict:
        raise ToolExecutionError("HubSpot handler not yet implemented (stub)")
