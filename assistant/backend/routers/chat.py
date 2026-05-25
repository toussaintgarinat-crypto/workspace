"""SSE streaming chat — orchestrates RAG, persona, prompt-engineer + ReAct agent."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from agent import ReActAgent
from auth import get_current_user
from models.schemas import ChatBody
import persona as persona_mod
from prompt_engineer import PromptEngineer
import rag as rag_mod
from services.connections_service import resolve_active_connections
from services.llm_service import gateway_client
from services.oria_trace_service import post_oria_trace

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])


@router.post("/chat")
async def chat(body: ChatBody, user: dict = Depends(get_current_user)):
    from metrics import chat_requests_total
    from quota import check_quota

    chat_requests_total.inc()
    await check_quota(user)

    active = await resolve_active_connections(user)

    # ── Prompt refinement ────────────────────────────────────────────────────
    raw_prompt = ""
    refined_data: dict | None = None
    effective_messages = list(body.messages)

    if body.use_prompt_engineer and body.messages:
        last = body.messages[-1]
        if last.get("role") == "user":
            raw_prompt = last.get("content", "")
            refined_data = await PromptEngineer().refine(raw_prompt)
            if refined_data and refined_data.get("refined_prompt"):
                effective_messages = list(body.messages[:-1]) + [
                    {"role": "user", "content": refined_data["refined_prompt"]}
                ]

    persona = await persona_mod.get_persona(user.get("sub", "anonymous"))
    personality = await persona_mod.get_personality(persona.get("assistant_personality", "default"))
    persona_context = persona_mod.build_persona_context(persona, personality)

    agent = ReActAgent(active)

    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        tools_used: list[str] = []
        result_parts: list[str] = []

        # RAG — fetch relevant memories before running the agent
        rag_context = ""
        if body.rag_enabled and effective_messages:
            last_user = next(
                (m for m in reversed(effective_messages) if m.get("role") == "user"),
                None,
            )
            if last_user:
                rag_context, rag_sources = await rag_mod.fetch_rag_context(
                    last_user.get("content", ""), active
                )
                if rag_sources:
                    from metrics import rag_injections_total
                    rag_injections_total.inc(len(rag_sources))
                    yield json.dumps(
                        {"type": "rag_sources", "sources": rag_sources},
                        ensure_ascii=False,
                    )

        async def on_chunk(chunk: dict):
            if chunk.get("type") == "tool_start":
                tools_used.append(chunk["name"])
            elif chunk.get("type") == "text":
                result_parts.append(chunk.get("content", ""))
            await queue.put(chunk)

        async def run_agent():
            try:
                await agent.stream_chat(
                    effective_messages,
                    on_chunk,
                    rag_context=rag_context,
                    model=body.model,
                    persona_context=persona_context,
                )
            except Exception as e:
                logger.error("Agent error: %s", e)
                await queue.put({"type": "error", "content": str(e)})
            finally:
                await queue.put(None)

        task = asyncio.create_task(run_agent())

        if refined_data:
            yield json.dumps(
                {"type": "prompt_refined", "data": refined_data}, ensure_ascii=False
            )

        while True:
            item = await queue.get()
            if item is None:
                if body.use_prompt_engineer and raw_prompt:
                    asyncio.create_task(
                        post_oria_trace(
                            active,
                            raw_prompt,
                            refined_data,
                            tools_used,
                            "".join(result_parts),
                        )
                    )
                llm = gateway_client(versioned=True)
                asyncio.create_task(
                    persona_mod.infer_from_conversation(
                        effective_messages, user.get("sub", "anonymous"), llm
                    )
                )
                yield json.dumps({"type": "done"}, ensure_ascii=False)
                break
            yield json.dumps(item, ensure_ascii=False)

        await task

    return EventSourceResponse(event_generator())
