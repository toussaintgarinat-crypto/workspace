import logging
import httpx

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


class ForgeTools:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._headers = {"Authorization": f"Bearer {token}"}

    def get_tools(self) -> list[dict]:
        return OPENAI_TOOLS

    async def create_task(self, title: str, description: str, pole: str = "") -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/api/tasks",
                json={"title": title, "description": description, "pole": pole},
                headers=self._headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def list_tasks(self, limit: int = 10) -> list[dict]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/api/tasks",
                params={"limit": limit},
                headers=self._headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def create_sprint(self, name: str, goal: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/api/sprints",
                json={"name": name, "goal": goal},
                headers=self._headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def execute_tool(self, name: str, args: dict) -> str:
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
        raise ValueError(f"Unknown tool: {name}")
