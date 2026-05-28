"""BaseToolHandler — contrat ABC pour tous les handlers du registry ToolHub."""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolAction:
    """Décrit une action exposée par un handler."""
    name: str
    description: str
    parameters: dict
    cache_ttl: int = 0


class BaseToolHandler(abc.ABC):
    """Contrat à implémenter pour chaque outil du registry.

    Conventions :
    - CATEGORY correspond au slug de ToolCategory en base
    - NAME correspond au champ `name` dans la table tools
    - CONFIG_SCHEMA décrit les champs requis dans les credentials
    """

    CATEGORY: str = ""
    NAME: str = ""
    LABEL: str = ""
    DESCRIPTION: str = ""
    INTEGRATION_TYPE: str = "api"
    CONFIG_SCHEMA: dict = field(default_factory=dict)
    CACHE_TTL: int = 0

    @abc.abstractmethod
    async def execute(self, action: str, params: dict, credentials: dict) -> Any:
        """Exécute une action.

        Args:
            action      : nom de l'action (ex: "send_email")
            params      : paramètres de l'appel
            credentials : credentials déchiffrés (dict JSON)

        Returns:
            Résultat sérialisable JSON

        Raises:
            ToolExecutionError : si l'exécution échoue
        """
        ...

    @abc.abstractmethod
    def list_actions(self) -> list[ToolAction]:
        """Retourne la liste des actions supportées."""
        ...

    def to_openai_tools(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": f"{self.NAME}_{action.name}",
                    "description": action.description,
                    "parameters": action.parameters,
                },
            }
            for action in self.list_actions()
        ]

    def to_mcp_tools(self) -> list[dict]:
        return [
            {
                "name": f"{self.NAME}_{action.name}",
                "description": action.description,
                "inputSchema": action.parameters,
            }
            for action in self.list_actions()
        ]


class ToolExecutionError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code
