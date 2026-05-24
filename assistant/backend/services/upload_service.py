"""Document upload helpers shared by the /upload endpoints.

S99 : migration vers S2SClient (retry + circuit breaker).
Note : `push_document_to_mempalace` upload des fichiers binaires (multipart),
S2SClient gere les `files=`/`data=` via kwargs httpx passthrough.
"""

import logging

from agent_personnel_shared.http_client import S2SClient, S2SError

logger = logging.getLogger(__name__)


def _mp_client(mp_conn: dict, timeout: float) -> S2SClient:
    return S2SClient(
        base_url=mp_conn["url"],
        token=mp_conn.get("token"),
        service_name="mempalace",
        timeout=timeout,
    )


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
        resp = await _mp_client(mp_conn, timeout=30).post(
            "/v1/api/documents",
            files={"file": (filename, content, mime or "application/octet-stream")},
            data={"wing": wing.lower(), "room": room},
        )
        return resp.json().get("id")
    except S2SError as e:
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
        await _mp_client(mp_conn, timeout=10).post(
            "/v1/api/drawers",
            json={
                "content": summary,
                "wing": wing.lower(),
                "room": room.lower().replace(" ", "-"),
                "metadata": {"source_file": filename, "file_id": file_id},
            },
        )
        return True, None
    except S2SError as e:
        logger.error("MemPalace confirm failed: %s", e)
        return False, str(e)
