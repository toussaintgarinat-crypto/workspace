"""Swarm Kanban — tasks CRUD + SSE event stream."""

import asyncio
import json
import uuid as _uuid

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

import swarm as swarm_mod
from models.schemas import SwarmTaskBody

router = APIRouter(prefix="/swarm", tags=["swarm"])


@router.get("/tasks")
async def swarm_list():
    return await swarm_mod.list_swarm_tasks()


@router.post("/tasks")
async def swarm_create(body: SwarmTaskBody):
    task_id = body.id or str(_uuid.uuid4())
    return await swarm_mod.create_swarm_task(
        task_id, body.title, body.role, body.instructions
    )


@router.patch("/tasks/{task_id}/done")
async def swarm_done(task_id: str):
    return await swarm_mod.mark_task_done(task_id)


@router.delete("/tasks/{task_id}")
async def swarm_cancel(task_id: str):
    await swarm_mod.cancel_swarm_task(task_id)
    return {"cancelled": task_id}


@router.get("/events")
async def swarm_events():
    from metrics import sse_clients_active
    q = swarm_mod.subscribe()
    sse_clients_active.labels(stream="swarm").inc()

    async def generator():
        tasks = await swarm_mod.list_swarm_tasks()
        yield json.dumps({"type": "init", "tasks": tasks}, ensure_ascii=False)
        try:
            while True:
                try:
                    item = await asyncio.wait_for(q.get(), timeout=25)
                    yield json.dumps(item, ensure_ascii=False)
                except asyncio.TimeoutError:
                    yield json.dumps({"type": "ping"}, ensure_ascii=False)
        except asyncio.CancelledError:
            pass
        finally:
            swarm_mod.unsubscribe(q)
            sse_clients_active.labels(stream="swarm").dec()

    return EventSourceResponse(generator())
