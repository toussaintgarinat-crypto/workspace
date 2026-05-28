"""GitHubHandler — create_issue et list_repos via GitHub REST API v3."""
from __future__ import annotations

import logging

import httpx

from registry.base import BaseToolHandler, ToolAction, ToolExecutionError

logger = logging.getLogger(__name__)


class GitHubHandler(BaseToolHandler):
    CATEGORY = "development"
    NAME = "github"
    LABEL = "GitHub"
    DESCRIPTION = "Créer des issues et lister les repos GitHub."
    INTEGRATION_TYPE = "api"
    CONFIG_SCHEMA = {
        "type": "object",
        "properties": {
            "token": {
                "type": "string",
                "description": "Personal Access Token GitHub (scopes: repo, issues)",
            },
        },
        "required": ["token"],
    }
    CACHE_TTL = 120

    _BASE = "https://api.github.com"

    def list_actions(self) -> list[ToolAction]:
        return [
            ToolAction(
                name="create_issue",
                description="Crée une issue GitHub dans un dépôt.",
                parameters={
                    "type": "object",
                    "properties": {
                        "owner": {"type": "string", "description": "Propriétaire du dépôt"},
                        "repo": {"type": "string", "description": "Nom du dépôt"},
                        "title": {"type": "string", "description": "Titre de l'issue"},
                        "body": {"type": "string", "description": "Corps de l'issue (Markdown)"},
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Labels à appliquer",
                        },
                    },
                    "required": ["owner", "repo", "title"],
                },
                cache_ttl=0,
            ),
            ToolAction(
                name="list_repos",
                description="Liste les dépôts accessibles pour l'utilisateur authentifié.",
                parameters={
                    "type": "object",
                    "properties": {
                        "per_page": {"type": "integer", "description": "Nombre de repos", "default": 20},
                        "visibility": {
                            "type": "string",
                            "enum": ["all", "public", "private"],
                            "default": "all",
                        },
                    },
                    "required": [],
                },
                cache_ttl=self.CACHE_TTL,
            ),
        ]

    def _headers(self, token: str) -> dict:
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def execute(self, action: str, params: dict, credentials: dict) -> dict:
        token = credentials.get("token")
        if not token:
            raise ToolExecutionError("GitHub credentials missing 'token'")
        if action == "create_issue":
            return await self._create_issue(params, token)
        if action == "list_repos":
            return await self._list_repos(params, token)
        raise ToolExecutionError(f"Unknown GitHub action: {action}")

    async def _create_issue(self, params: dict, token: str) -> dict:
        body: dict = {"title": params["title"], "body": params.get("body", "")}
        if labels := params.get("labels"):
            body["labels"] = labels
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self._BASE}/repos/{params['owner']}/{params['repo']}/issues",
                headers=self._headers(token),
                json=body,
            )
        if resp.status_code >= 400:
            raise ToolExecutionError(f"GitHub API error {resp.status_code}: {resp.text[:200]}", status_code=resp.status_code)
        data = resp.json()
        return {"issue_number": data.get("number"), "url": data.get("html_url"), "title": data.get("title"), "state": data.get("state")}

    async def _list_repos(self, params: dict, token: str) -> dict:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{self._BASE}/user/repos",
                headers=self._headers(token),
                params={"per_page": params.get("per_page", 20), "visibility": params.get("visibility", "all"), "sort": "updated"},
            )
        if resp.status_code >= 400:
            raise ToolExecutionError(f"GitHub list repos error {resp.status_code}: {resp.text[:200]}", status_code=resp.status_code)
        repos = resp.json()
        return {
            "repos": [{"name": r["name"], "full_name": r["full_name"], "private": r["private"], "url": r["html_url"]} for r in repos],
            "count": len(repos),
        }
