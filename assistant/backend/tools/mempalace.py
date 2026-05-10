import logging
import httpx

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


class MemPalaceTools:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._headers = {"Authorization": f"Bearer {token}"}

    def get_tools(self) -> list[dict]:
        return OPENAI_TOOLS

    async def search(self, query: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/api/search",
                json={"query": query, "n_results": 5},
                headers=self._headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("results", data)

    async def add_memory(self, content: str, category: str, title: str) -> dict:
        wing = category.lower() if category else "input"
        room = title.lower().replace(" ", "-")[:32] if title else "general"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/api/drawers",
                json={"content": content, "wing": wing, "room": room},
                headers=self._headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def list_categories(self) -> list[str]:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self.base_url}/api/wings", headers=self._headers)
                resp.raise_for_status()
                wings = resp.json()
                return [w["wing"] for w in wings] if wings else ["Input", "Projet", "Casquette", "Ressource", "Archive"]
        except Exception:
            return ["Input", "Projet", "Casquette", "Ressource", "Archive"]

    async def execute_tool(self, name: str, args: dict) -> str:
        if name == "mempalace_search":
            results = await self.search(args["query"])
            return str(results)
        if name == "mempalace_add_memory":
            result = await self.add_memory(args["content"], args["category"], args["title"])
            return str(result)
        if name == "mempalace_list_categories":
            cats = await self.list_categories()
            return str(cats)
        raise ValueError(f"Unknown tool: {name}")
