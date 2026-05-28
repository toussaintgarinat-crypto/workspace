"""ToolHub tools — wrapper OpenAI function-calling pour exécuter des outils externes.

Délègue à ToolHub via S2SClient. La liste des outils est découverte dynamiquement
via GET /v1/tools (outils actifs pour l'utilisateur).
"""

import logging
from typing import Any

from agent_personnel_shared.http_client import S2SClient, S2SError

logger = logging.getLogger(__name__)

_TOOLHUB_DOWN_MSG = "ToolHub indisponible, je continue sans accès aux outils externes."


class ToolHubTools:
    """Handler dynamique : les tools OpenAI sont construits à partir de /v1/tools."""

    def __init__(self, base_url: str, service_token: str, user_id: str):
        self._client = S2SClient(
            base_url=base_url,
            token=service_token,
            service_name="toolhub",
            timeout=30.0,
        )
        self._user_id = user_id
        self._openai_tools: list[dict] = []

    def _h(self) -> dict:
        return {"X-User-Id": self._user_id}

    async def load_tools(self) -> None:
        """Charge la liste des outils depuis ToolHub (à appeler avant _build_tools)."""
        try:
            resp = await self._client.get("/v1/tools", headers=self._h())
            tools_data = resp.json()
            self._openai_tools = [
                {
                    "type": "function",
                    "function": {
                        "name": f"toolhub_{tool['name']}_{action['name']}",
                        "description": f"[{tool['label']}] {action['description']}",
                        "parameters": action["parameters"],
                    },
                }
                for tool in tools_data
                for action in tool.get("actions", [])
            ]
            logger.info("ToolHub: loaded %d tool actions", len(self._openai_tools))
        except S2SError as exc:
            logger.warning("ToolHub unavailable, tools not loaded: %s", exc)
            self._openai_tools = []

    def get_tools(self) -> list[dict]:
        return self._openai_tools

    async def execute_tool(self, name: str, args: dict) -> str:
        """name = 'toolhub_gmail_send_email' → tool_name='gmail', action='send_email'."""
        try:
            without_prefix = name.removeprefix("toolhub_")
            parts = without_prefix.split("_", 1)
            if len(parts) != 2:
                return f"Nom d'outil invalide: {name}"
            tool_name, action = parts
            resp = await self._client.post(
                f"/v1/execute/{tool_name}",
                json={"action": action, "params": args},
                headers=self._h(),
            )
            data = resp.json()
            return str(data.get("result", data))
        except S2SError as exc:
            logger.warning("ToolHub S2S failure on %s: %s", name, exc)
            return _TOOLHUB_DOWN_MSG
