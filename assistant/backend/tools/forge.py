"""Forge tools — wrappers OpenAI function-calling pour creer/lister taches & sprints.

S99 : migration vers `agent_personnel_shared.http_client.S2SClient` pour
beneficier de retry + circuit breaker + fallback gracieux automatique.
Les paths sont prefixes `/v1/...` (alias legacy `/api/...` toujours actif).
"""

import logging

from agent_personnel_shared.http_client import S2SClient, S2SError

logger = logging.getLogger(__name__)

OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "forge_create_task",
            "description": "Create a new task in Forge project manager.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Task title"},
                    "description": {"type": "string", "description": "Task description"},
                    "pole": {"type": "string", "description": "Pole or team this task belongs to (optional)"},
                },
                "required": ["title", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "forge_list_tasks",
            "description": "List recent tasks from Forge project manager.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Number of tasks to return (default 10)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "forge_create_sprint",
            "description": "Create a new sprint in Forge project manager.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Sprint name"},
                    "goal": {"type": "string", "description": "Sprint goal or objective"},
                },
                "required": ["name", "goal"],
            },
        },
    },
]


# Message renvoye au LLM quand Forge est indispo — il continue le tour de parole
# sans crasher la conversation.
_FORGE_DOWN_MSG = "Forge indisponible (circuit ouvert ou backend down), je continue sans creer/lister la tache."


class ForgeTools:
    def __init__(self, base_url: str, token: str):
        self._client = S2SClient(
            base_url=base_url,
            token=token,
            service_name="forge",
            timeout=10.0,
        )

    def get_tools(self) -> list[dict]:
        return OPENAI_TOOLS

    async def create_task(self, title: str, description: str, pole: str = "") -> dict:
        resp = await self._client.post(
            "/v1/api/tasks",
            json={"title": title, "description": description, "pole": pole},
        )
        return resp.json()

    async def list_tasks(self, limit: int = 10) -> list[dict]:
        resp = await self._client.get("/v1/api/tasks", params={"limit": limit})
        return resp.json()

    async def create_sprint(self, name: str, goal: str) -> dict:
        resp = await self._client.post(
            "/v1/api/sprints",
            json={"name": name, "goal": goal},
        )
        return resp.json()

    async def execute_tool(self, name: str, args: dict) -> str:
        """Tool dispatcher. Renvoie un message degrade au LLM si Forge tombe."""
        try:
            if name == "forge_create_task":
                result = await self.create_task(
                    args["title"], args["description"], args.get("pole", "")
                )
                return str(result)
            if name == "forge_list_tasks":
                result = await self.list_tasks(args.get("limit", 10))
                return str(result)
            if name == "forge_create_sprint":
                result = await self.create_sprint(args["name"], args["goal"])
                return str(result)
        except S2SError as exc:  # circuit ouvert OU erreur reseau finale
            logger.warning("Forge S2S failure on %s: %s", name, exc)
            return _FORGE_DOWN_MSG
        raise ValueError(f"Unknown tool: {name}")
