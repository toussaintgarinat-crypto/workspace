"""Oria tools — wrappers OpenAI function-calling pour worlds/rooms/messages.

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


_ORIA_DOWN_MSG = "Oria indisponible (circuit ouvert ou backend down), je continue sans interagir avec le world."


class OriaTools:
    def __init__(self, base_url: str, token: str):
        self._client = S2SClient(
            base_url=base_url,
            token=token,
            service_name="oria",
            timeout=10.0,
        )

    def get_tools(self) -> list[dict]:
        return OPENAI_TOOLS

    async def list_worlds(self) -> list[dict]:
        resp = await self._client.get("/v1/api/worlds")
        return resp.json()

    async def post_message(self, room_id: str, message: str) -> dict:
        resp = await self._client.post(
            f"/v1/api/rooms/{room_id}/messages",
            json={"message": message},
        )
        return resp.json()

    async def list_rooms(self, world_id: str = "") -> list[dict]:
        params = {}
        if world_id:
            params["world_id"] = world_id
        resp = await self._client.get("/v1/api/rooms", params=params)
        return resp.json()

    async def execute_tool(self, name: str, args: dict) -> str:
        """Tool dispatcher. Degradation gracieuse si Oria tombe."""
        try:
            if name == "oria_list_worlds":
                result = await self.list_worlds()
                return str(result)
            if name == "oria_post_message":
                result = await self.post_message(args["room_id"], args["message"])
                return str(result)
            if name == "oria_list_rooms":
                result = await self.list_rooms(args.get("world_id", ""))
                return str(result)
        except S2SError as exc:
            logger.warning("Oria S2S failure on %s: %s", name, exc)
            return _ORIA_DOWN_MSG
        raise ValueError(f"Unknown tool: {name}")
