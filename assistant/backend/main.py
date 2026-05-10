import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from config import settings
from db import init_db, get_connections, upsert_connection, delete_connection
from agent import ReActAgent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Assistant Backend", version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionBody(BaseModel):
    id: str
    name: str
    url: str
    token: str
    app_type: str
    enabled: bool = True


class ChatBody(BaseModel):
    messages: list[dict]


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/connections")
async def list_connections():
    return await get_connections()


@app.post("/connections")
async def create_connection(body: ConnectionBody):
    return await upsert_connection(
        id=body.id,
        name=body.name,
        url=body.url,
        token=body.token,
        app_type=body.app_type,
        enabled=body.enabled,
    )


@app.delete("/connections/{connection_id}")
async def remove_connection(connection_id: str):
    await delete_connection(connection_id)
    return {"deleted": connection_id}


@app.post("/chat")
async def chat(body: ChatBody):
    connections = await get_connections()
    active = [c for c in connections if c.get("enabled")]
    agent = ReActAgent(active)

    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()

        async def on_chunk(chunk: dict):
            await queue.put(chunk)

        async def run_agent():
            try:
                await agent.stream_chat(body.messages, on_chunk)
            except Exception as e:
                logger.error("Agent error: %s", e)
                await queue.put({"type": "error", "content": str(e)})
            finally:
                await queue.put(None)

        task = asyncio.create_task(run_agent())

        while True:
            item = await queue.get()
            if item is None:
                yield json.dumps({"type": "done"}, ensure_ascii=False)
                break
            yield json.dumps(item, ensure_ascii=False)

        await task

    return EventSourceResponse(event_generator())
