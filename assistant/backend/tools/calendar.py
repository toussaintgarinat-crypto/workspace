"""Calendar tools — wrappers OpenAI function-calling pour créer/lister/modifier des événements.

S106e : accès au service calendar via S2S (CALENDAR_SERVICE_TOKEN + X-User-Id).
Le CalendarTools est instancié par requête (user_id nécessaire) dans agent.py.
"""

import logging

from agent_personnel_shared.http_client import S2SClient, S2SError

logger = logging.getLogger(__name__)

OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calendar_list_calendars",
            "description": "Liste tous les calendriers de l'utilisateur (propres + partagés).",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_list_events",
            "description": "Liste les événements d'un calendrier, avec filtres de dates optionnels.",
            "parameters": {
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string", "description": "ID du calendrier"},
                    "start": {
                        "type": "string",
                        "description": "Date de début ISO 8601 (ex: 2026-05-25T00:00:00)",
                    },
                    "end": {
                        "type": "string",
                        "description": "Date de fin ISO 8601 (ex: 2026-05-31T23:59:59)",
                    },
                },
                "required": ["calendar_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_create_event",
            "description": "Crée un événement dans un calendrier.",
            "parameters": {
                "type": "object",
                "properties": {
                    "calendar_id": {"type": "string", "description": "ID du calendrier cible"},
                    "title": {"type": "string", "description": "Titre de l'événement"},
                    "start_at": {
                        "type": "string",
                        "description": "Début ISO 8601 (ex: 2026-05-26T14:00:00)",
                    },
                    "end_at": {
                        "type": "string",
                        "description": "Fin ISO 8601 (ex: 2026-05-26T15:00:00)",
                    },
                    "description": {"type": "string", "description": "Description optionnelle"},
                    "location": {"type": "string", "description": "Lieu optionnel"},
                    "all_day": {
                        "type": "boolean",
                        "description": "True si événement toute la journée",
                    },
                },
                "required": ["calendar_id", "title", "start_at", "end_at"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_update_event",
            "description": "Modifie un événement existant (titre, dates, description, lieu).",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string", "description": "ID de l'événement à modifier"},
                    "title": {"type": "string", "description": "Nouveau titre"},
                    "start_at": {"type": "string", "description": "Nouvelle date de début ISO 8601"},
                    "end_at": {"type": "string", "description": "Nouvelle date de fin ISO 8601"},
                    "description": {"type": "string", "description": "Nouvelle description"},
                    "location": {"type": "string", "description": "Nouveau lieu"},
                },
                "required": ["event_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_delete_event",
            "description": "Supprime un événement du calendrier.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string", "description": "ID de l'événement à supprimer"},
                },
                "required": ["event_id"],
            },
        },
    },
]

_CALENDAR_DOWN_MSG = "Service calendrier indisponible, je continue sans accéder au calendrier."


class CalendarTools:
    def __init__(self, base_url: str, service_token: str, user_id: str):
        self._client = S2SClient(
            base_url=base_url,
            token=service_token,
            service_name="calendar",
            timeout=10.0,
        )
        self._user_id = user_id

    def _h(self) -> dict:
        return {"X-User-Id": self._user_id}

    def get_tools(self) -> list[dict]:
        return OPENAI_TOOLS

    async def list_calendars(self) -> list[dict]:
        resp = await self._client.get("/calendars", headers=self._h())
        return resp.json()

    async def list_events(self, calendar_id: str, start: str = "", end: str = "") -> list[dict]:
        params: dict = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end
        resp = await self._client.get(
            f"/calendars/{calendar_id}/events", params=params, headers=self._h()
        )
        return resp.json()

    async def create_event(
        self,
        calendar_id: str,
        title: str,
        start_at: str,
        end_at: str,
        description: str = "",
        location: str = "",
        all_day: bool = False,
    ) -> dict:
        body: dict = {
            "title": title,
            "start_at": start_at,
            "end_at": end_at,
            "calendar_id": calendar_id,
        }
        if description:
            body["description"] = description
        if location:
            body["location"] = location
        if all_day:
            body["all_day"] = all_day
        resp = await self._client.post(
            f"/calendars/{calendar_id}/events", json=body, headers=self._h()
        )
        return resp.json()

    async def update_event(self, event_id: str, **fields) -> dict:
        resp = await self._client.patch(
            f"/events/{event_id}", json=fields, headers=self._h()
        )
        return resp.json()

    async def delete_event(self, event_id: str) -> str:
        await self._client.delete(f"/events/{event_id}", headers=self._h())
        return "Événement supprimé."

    async def execute_tool(self, name: str, args: dict) -> str:
        try:
            if name == "calendar_list_calendars":
                result = await self.list_calendars()
                return str(result)
            if name == "calendar_list_events":
                result = await self.list_events(
                    args["calendar_id"], args.get("start", ""), args.get("end", "")
                )
                return str(result)
            if name == "calendar_create_event":
                result = await self.create_event(
                    args["calendar_id"],
                    args["title"],
                    args["start_at"],
                    args["end_at"],
                    args.get("description", ""),
                    args.get("location", ""),
                    args.get("all_day", False),
                )
                return str(result)
            if name == "calendar_update_event":
                event_id = args.pop("event_id")
                result = await self.update_event(event_id, **args)
                return str(result)
            if name == "calendar_delete_event":
                return await self.delete_event(args["event_id"])
        except S2SError as exc:
            logger.warning("Calendar S2S failure on %s: %s", name, exc)
            return _CALENDAR_DOWN_MSG
        raise ValueError(f"Unknown tool: {name}")
