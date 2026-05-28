import json
import logging
from typing import Callable

from openai import AsyncOpenAI

import httpx

from config import settings
from tools.mempalace import MemPalaceTools
from tools.forge import ForgeTools
from tools.oria import OriaTools
from tools.kiwix import KiwixTools
from tools.calendar import CalendarTools
from tools.toolhub import ToolHubTools

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 5

_kiwix_handler: KiwixTools | None = None


async def init_kiwix() -> None:
    global _kiwix_handler
    if not settings.KIWIX_URL:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.KIWIX_URL}/")
        if resp.status_code < 500:
            _kiwix_handler = KiwixTools(settings.KIWIX_URL)
            logger.info("Kiwix tool enabled: %s", settings.KIWIX_URL)
    except Exception as e:
        logger.warning("Kiwix unreachable at startup, tool disabled: %s", e)


class ReActAgent:
    def __init__(self, connections: list[dict], user_id: str = ""):
        self.connections = connections
        self.user_id = user_id
        self._tool_handlers: dict = {}
        self._tools: list[dict] = []
        self._toolhub_handler: ToolHubTools | None = None
        self._build_tools()

    def _build_tools(self):
        for conn in self.connections:
            if not conn.get("enabled"):
                continue
            app_type = conn["app_type"]
            url = conn["url"]
            token = conn["token"]
            try:
                if app_type == "mempalace":
                    handler = MemPalaceTools(url, token)
                elif app_type == "forge":
                    handler = ForgeTools(url, token)
                elif app_type == "oria":
                    handler = OriaTools(url, token)
                else:
                    continue
                for tool in handler.get_tools():
                    self._tools.append(tool)
                    self._tool_handlers[tool["function"]["name"]] = handler
            except Exception as e:
                logger.error("Failed to init tools for %s (%s): %s", conn.get("name"), app_type, e)

        if _kiwix_handler is not None:
            for tool in _kiwix_handler.get_tools():
                self._tools.append(tool)
                self._tool_handlers[tool["function"]["name"]] = _kiwix_handler

        if settings.CALENDAR_URL and self.user_id:
            cal_handler = CalendarTools(
                settings.CALENDAR_URL, settings.CALENDAR_SERVICE_TOKEN, self.user_id
            )
            for tool in cal_handler.get_tools():
                self._tools.append(tool)
                self._tool_handlers[tool["function"]["name"]] = cal_handler

        if settings.TOOLHUB_URL and self.user_id:
            self._toolhub_handler = ToolHubTools(
                settings.TOOLHUB_URL, settings.TOOLHUB_SERVICE_TOKEN, self.user_id
            )

    def build_tools(self) -> list[dict]:
        return self._tools

    async def load_toolhub_tools(self) -> None:
        """Charge les outils ToolHub de manière asynchrone (appeler avant stream_chat)."""
        if self._toolhub_handler:
            await self._toolhub_handler.load_tools()
            # Re-register tools après chargement
            for tool in self._toolhub_handler.get_tools():
                if not any(t["function"]["name"] == tool["function"]["name"] for t in self._tools):
                    self._tools.append(tool)
                    self._tool_handlers[tool["function"]["name"]] = self._toolhub_handler

    def build_system_prompt(self, tool_names: list[str], persona_context: str = "") -> str:
        tools_section = "\n".join(f"- {n}" for n in tool_names) if tool_names else "Aucun outil disponible."
        base = (
            "Tu es un assistant personnel intelligent connecté aux apps de ton utilisateur.\n\n"
            "Outils disponibles :\n"
            f"{tools_section}\n\n"
            "Règles :\n"
            "- Avant de sauvegarder une information dans MemPalace, demande confirmation sur la catégorie "
            "et le titre si le contexte n'est pas clair.\n"
            "- Utilise les outils de manière proactive quand c'est pertinent.\n"
            "- Si un outil échoue, informe l'utilisateur et continue sans lui.\n"
            "- Réponds toujours en français sauf demande contraire."
        )
        if persona_context:
            base += persona_context
        return base

    async def stream_chat(self, messages: list[dict], on_chunk: Callable, rag_context: str = "", model: str | None = None, persona_context: str = "") -> dict:
        from openai import RateLimitError, APIStatusError, APITimeoutError, APIConnectionError

        primary_model = model or settings.GATEWAY_MODEL
        fallbacks = [m.strip() for m in settings.FALLBACK_MODELS.split(',') if m.strip()]
        models_to_try = [primary_model] + fallbacks

        client = AsyncOpenAI(
            base_url=f"{settings.GATEWAY_URL}/v1",
            api_key=settings.GATEWAY_API_KEY,
        )

        last_error: Exception | None = None

        for attempt_model in models_to_try:
            content_started = [False]
            total_tokens_in = 0
            total_tokens_out = 0

            async def on_chunk_tracked(chunk: dict) -> None:
                if chunk.get("type") in ("text", "tool_start"):
                    content_started[0] = True
                await on_chunk(chunk)

            try:
                # — run the conversation with attempt_model —
                tool_names = [t["function"]["name"] for t in self._tools]
                system_content = self.build_system_prompt(tool_names, persona_context)
                if rag_context:
                    system_content += f"\n\n{rag_context}"
                system_message = {"role": "system", "content": system_content}
                history = [system_message] + list(messages)

                for _ in range(MAX_ITERATIONS):
                    kwargs: dict = {
                        "model": attempt_model,
                        "messages": history,
                        "stream": True,
                        "stream_options": {"include_usage": True},
                    }
                    if self._tools:
                        kwargs["tools"] = self._tools
                        kwargs["tool_choice"] = "auto"

                    collected_content = ""
                    collected_tool_calls: dict[int, dict] = {}

                    stream = await client.chat.completions.create(**kwargs)
                    async for chunk in stream:
                        if not chunk.choices:
                            if chunk.usage is not None:
                                total_tokens_in  += chunk.usage.prompt_tokens     or 0
                                total_tokens_out += chunk.usage.completion_tokens or 0
                            continue
                        delta = chunk.choices[0].delta

                        if delta.content:
                            collected_content += delta.content
                            await on_chunk_tracked({"type": "text", "content": delta.content})

                        if delta.tool_calls:
                            for tc in delta.tool_calls:
                                idx = tc.index
                                if idx not in collected_tool_calls:
                                    collected_tool_calls[idx] = {
                                        "id": tc.id or "",
                                        "name": (tc.function.name or "") if tc.function else "",
                                        "arguments": "",
                                    }
                                if tc.id:
                                    collected_tool_calls[idx]["id"] = tc.id
                                if tc.function:
                                    if tc.function.name:
                                        collected_tool_calls[idx]["name"] = tc.function.name
                                    if tc.function.arguments:
                                        collected_tool_calls[idx]["arguments"] += tc.function.arguments

                    if not collected_tool_calls:
                        break

                    assistant_tool_calls = [
                        {
                            "id": v["id"],
                            "type": "function",
                            "function": {"name": v["name"], "arguments": v["arguments"]},
                        }
                        for v in collected_tool_calls.values()
                    ]
                    history.append({
                        "role": "assistant",
                        "content": collected_content or None,
                        "tool_calls": assistant_tool_calls,
                    })

                    for tc in assistant_tool_calls:
                        tool_name = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"] or "{}")
                        except Exception:
                            args = {}
                        await on_chunk_tracked({"type": "tool_start", "name": tool_name, "args": args})
                        error = False
                        try:
                            handler = self._tool_handlers.get(tool_name)
                            if handler is None:
                                result_str = f"Outil inconnu : {tool_name}"
                                error = True
                            else:
                                result_str = await handler.execute_tool(tool_name, args)
                        except Exception as e:
                            logger.error("Tool %s failed: %s", tool_name, e)
                            result_str = f"Erreur : {e}"
                            error = True

                        await on_chunk({"type": "tool_result", "name": tool_name, "result": result_str, "error": error})
                        history.append({"role": "tool", "tool_call_id": tc["id"], "content": result_str if isinstance(result_str, str) else json.dumps(result_str, ensure_ascii=False)})

                return {
                    "tokens_in": total_tokens_in,
                    "tokens_out": total_tokens_out,
                    "actual_model": attempt_model if attempt_model != primary_model else "",
                }

            except (RateLimitError, APITimeoutError, APIConnectionError) as e:
                if content_started[0]:
                    raise
                logger.warning("LLM %s unavailable (%s), trying next fallback", attempt_model, type(e).__name__)
                last_error = e
                continue
            except APIStatusError as e:
                if e.status_code < 500 or content_started[0]:
                    raise
                logger.warning("LLM %s server error %d, trying next fallback", attempt_model, e.status_code)
                last_error = e
                continue

        raise last_error or RuntimeError("No LLM available")
