"""Document upload helpers shared by the /upload endpoints."""

import logging

import httpx

logger = logging.getLogger(__name__)


async def push_document_to_mempalace(
    mp_conn: dict,
    filename: str,
    content: bytes,
    mime: str | None,
    wing: str,
    room: str,
) -> str | None:
    """POST the raw file to MemPalace and return the stored document ID (or None)."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{mp_conn['url'].rstrip('/')}/api/documents",
                files={"file": (filename, content, mime or "application/octet-stream")},
                data={"wing": wing.lower(), "room": room},
                headers={"Authorization": f"Bearer {mp_conn['token']}"},
            )
            if resp.status_code in (200, 201):
                return resp.json().get("id")
    except Exception as e:
        logger.warning("MemPalace raw upload failed: %s", e)
    return None


async def confirm_drawer_to_mempalace(
    mp_conn: dict,
    summary: str,
    wing: str,
    room: str,
    filename: str,
    file_id: str | None,
) -> tuple[bool, str | None]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{mp_conn['url'].rstrip('/')}/api/drawers",
                json={
                    "content": summary,
                    "wing": wing.lower(),
                    "room": room.lower().replace(" ", "-"),
                    "metadata": {"source_file": filename, "file_id": file_id},
                },
                headers={"Authorization": f"Bearer {mp_conn['token']}"},
            )
            resp.raise_for_status()
        return True, None
    except Exception as e:
        logger.error("MemPalace confirm failed: %s", e)
        return False, str(e)
