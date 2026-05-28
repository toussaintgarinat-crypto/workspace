"""GmailHandler — send_email et list_emails via Gmail REST API v1."""
from __future__ import annotations

import base64
import logging
from email.mime.text import MIMEText

import httpx

from registry.base import BaseToolHandler, ToolAction, ToolExecutionError

logger = logging.getLogger(__name__)


class GmailHandler(BaseToolHandler):
    CATEGORY = "communication"
    NAME = "gmail"
    LABEL = "Gmail"
    DESCRIPTION = "Envoyer et lire des emails via Gmail."
    INTEGRATION_TYPE = "api"
    CONFIG_SCHEMA = {
        "type": "object",
        "properties": {
            "access_token": {"type": "string", "description": "OAuth2 access token Gmail"},
        },
        "required": ["access_token"],
    }
    CACHE_TTL = 60

    _BASE = "https://gmail.googleapis.com/gmail/v1"

    def list_actions(self) -> list[ToolAction]:
        return [
            ToolAction(
                name="send_email",
                description="Envoie un email via Gmail.",
                parameters={
                    "type": "object",
                    "properties": {
                        "to": {"type": "string", "description": "Destinataire (email)"},
                        "subject": {"type": "string", "description": "Objet"},
                        "body": {"type": "string", "description": "Corps du message"},
                        "content_type": {
                            "type": "string",
                            "enum": ["plain", "html"],
                            "default": "plain",
                        },
                    },
                    "required": ["to", "subject", "body"],
                },
                cache_ttl=0,
            ),
            ToolAction(
                name="list_emails",
                description="Liste les derniers emails reçus.",
                parameters={
                    "type": "object",
                    "properties": {
                        "max_results": {
                            "type": "integer",
                            "description": "Nombre max d'emails",
                            "default": 10,
                        },
                        "label": {
                            "type": "string",
                            "description": "Label Gmail (ex: INBOX, SENT)",
                            "default": "INBOX",
                        },
                    },
                    "required": [],
                },
                cache_ttl=self.CACHE_TTL,
            ),
        ]

    async def execute(self, action: str, params: dict, credentials: dict) -> dict:
        token = credentials.get("access_token")
        if not token:
            raise ToolExecutionError("Gmail credentials missing 'access_token'")
        headers = {"Authorization": f"Bearer {token}"}
        if action == "send_email":
            return await self._send_email(params, headers)
        if action == "list_emails":
            return await self._list_emails(params, headers)
        raise ToolExecutionError(f"Unknown Gmail action: {action}")

    async def _send_email(self, params: dict, headers: dict) -> dict:
        msg = MIMEText(params["body"], params.get("content_type", "plain"))
        msg["to"] = params["to"]
        msg["subject"] = params["subject"]
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self._BASE}/users/me/messages/send",
                headers=headers,
                json={"raw": raw},
            )
        if resp.status_code >= 400:
            raise ToolExecutionError(f"Gmail API error {resp.status_code}: {resp.text[:200]}", status_code=resp.status_code)
        data = resp.json()
        return {"message_id": data.get("id"), "status": "sent"}

    async def _list_emails(self, params: dict, headers: dict) -> dict:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{self._BASE}/users/me/messages",
                headers=headers,
                params={"labelIds": params.get("label", "INBOX"), "maxResults": params.get("max_results", 10)},
            )
        if resp.status_code >= 400:
            raise ToolExecutionError(f"Gmail list error {resp.status_code}: {resp.text[:200]}", status_code=resp.status_code)
        messages = resp.json().get("messages", [])
        return {"emails": messages, "count": len(messages)}
