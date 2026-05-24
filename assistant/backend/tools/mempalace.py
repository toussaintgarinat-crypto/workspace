"""MemPalace tools — wrappers OpenAI function-calling pour search/add/list.

S99 : migration vers `agent_personnel_shared.http_client.S2SClient`.
Paths prefixes `/v1/api/...` (alias legacy `/api/...` toujours actif).
"""

import logging

from agent_personnel_shared.http_client import S2SClient, S2SError

logger = logging.getLogger(__name__)

OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "mempalace_search",
            "description": "Search memories in MemPalace. Use this to find past notes, projects, resources or any stored knowledge.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mempalace_add_memory",
            "description": "Save a new memory in MemPalace. Ask the user for clarification on category and title before saving if unsure.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "Memory content"},
                    "category": {
                        "type": "string",
                        "description": "Category: Input, Projet, Casquette, Ressource, or Archive",
                    },
                    "title": {"type": "string", "description": "Short descriptive title"},
                },
                "required": ["content", "category", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mempalace_list_categories",
            "description": "List available memory categories in MemPalace.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


_DEFAULT_CATEGORIES = ["Input", "Projet", "Casquette", "Ressource", "Archive"]
_MP_DOWN_MSG = "MemPalace indisponible (circuit ouvert ou backend down), je continue sans memoire long-terme."


class MemPalaceTools:
    def __init__(self, base_url: str, token: str):
        self._client = S2SClient(
            base_url=base_url,
            token=token,
            service_name="mempalace",
            timeout=10.0,
        )

    def get_tools(self) -> list[dict]:
        return OPENAI_TOOLS

    async def search(self, query: str) -> list[dict]:
        resp = await self._client.post(
            "/v1/api/search",
            json={"query": query, "n_results": 5},
        )
        data = resp.json()
        return data.get("results", data)

    async def add_memory(self, content: str, category: str, title: str) -> dict:
        wing = category.lower() if category else "input"
        room = title.lower().replace(" ", "-")[:32] if title else "general"
        resp = await self._client.post(
            "/v1/api/drawers",
            json={"content": content, "wing": wing, "room": room},
        )
        return resp.json()

    async def list_categories(self) -> list[str]:
        try:
            resp = await self._client.get("/v1/api/wings")
            wings = resp.json()
            return [w["wing"] for w in wings] if wings else list(_DEFAULT_CATEGORIES)
        except S2SError:
            return list(_DEFAULT_CATEGORIES)

    async def execute_tool(self, name: str, args: dict) -> str:
        """Tool dispatcher. Degradation gracieuse si MemPalace tombe."""
        try:
            if name == "mempalace_search":
                results = await self.search(args["query"])
                return str(results)
            if name == "mempalace_add_memory":
                result = await self.add_memory(args["content"], args["category"], args["title"])
                return str(result)
            if name == "mempalace_list_categories":
                cats = await self.list_categories()
                return str(cats)
        except S2SError as exc:
            logger.warning("MemPalace S2S failure on %s: %s", name, exc)
            return _MP_DOWN_MSG
        raise ValueError(f"Unknown tool: {name}")
