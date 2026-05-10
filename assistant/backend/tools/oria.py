import logging
import httpx

logger = logging.getLogger(__name__)

OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "oria_list_worlds",
            "description": "List all worlds available in Oria collaborative space.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "oria_post_message",
            "description": "Post a message to a room in Oria.",
            "parameters": {
                "type": "object",
                "properties": {
                    "room_id": {"type": "string", "description": "Target room ID"},
                    "message": {"type": "string", "description": "Message content"},
                },
                "required": ["room_id", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "oria_list_rooms",
            "description": "List rooms in Oria, optionally filtered by world.",
            "parameters": {
                "type": "object",
                "properties": {
                    "world_id": {"type": "string", "description": "Filter rooms by world ID (optional)"},
                },
                "required": [],
            },
        },
    },
]


class OriaTools:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._headers = {"Authorization": f"Bearer {token}"}

    def get_tools(self) -> list[dict]:
        return OPENAI_TOOLS

    async def list_worlds(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{self.base_url}/api/worlds", headers=self._headers)
            resp.raise_for_status()
            return resp.json()

    async def post_message(self, room_id: str, message: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/api/rooms/{room_id}/messages",
                json={"message": message},
                headers=self._headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def list_rooms(self, world_id: str = "") -> list[dict]:
        params = {}
        if world_id:
            params["world_id"] = world_id
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/api/rooms",
                params=params,
                headers=self._headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def execute_tool(self, name: str, args: dict) -> str:
        if name == "oria_list_worlds":
            result = await self.list_worlds()
            return str(result)
        if name == "oria_post_message":
            result = await self.post_message(args["room_id"], args["message"])
            return str(result)
        if name == "oria_list_rooms":
            result = await self.list_rooms(args.get("world_id", ""))
            return str(result)
        raise ValueError(f"Unknown tool: {name}")
