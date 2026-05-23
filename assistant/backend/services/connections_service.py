"""Resolve active connections for the current user.

Two modes :
- AUTH_ENABLED=True  : per-user encrypted vault (`vault.list_vault` + `get_vault_token`).
- AUTH_ENABLED=False : global `connections` table (legacy single-user mode).
"""

from config import settings
from db import get_connections
from vault import list_vault, get_vault_token

from services.url_defaults import default_url


async def resolve_active_connections(user: dict) -> list[dict]:
    """Return the list of connections currently usable for the request."""
    if settings.AUTH_ENABLED:
        vault = await list_vault(user["sub"])
        active: list[dict] = []
        for entry in vault:
            token = await get_vault_token(user["sub"], entry["app_type"])
            if token:
                active.append({
                    "id": entry["app_type"],
                    "name": entry["app_type"].capitalize(),
                    "app_type": entry["app_type"],
                    "token": token,
                    "url": default_url(entry["app_type"]),
                    "enabled": True,
                })
        return active

    connections = await get_connections()
    return [c for c in connections if c.get("enabled")]
