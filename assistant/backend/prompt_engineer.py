import json
import logging

from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are a Senior Technical Intent Architect and Prompt Engineer.\n"
    "Analyze the user's prompt and return a JSON object with these exact fields:\n"
    "- input_type: 'text' | 'voice' | 'command' | 'question' | 'instruction'\n"
    "- objective: one-line goal of the request\n"
    "- interpreted_intent: deeper intent behind the surface request\n"
    "- improvements_made: list of strings describing improvements applied\n"
    "- suggested_destination: 'mempalace' | 'forge' | 'oria' | 'general'\n"
    "- refined_prompt: the improved, clearer version ready for an AI assistant\n"
    "- confidence: float 0.0-1.0\n"
    "- uncertainty_flags: list of ambiguities (empty list if none)\n"
    "- next_action_recommendation: what the assistant should prioritize\n\n"
    "Return ONLY valid JSON, no markdown fences, no extra text."
)


class PromptEngineer:
    async def refine(self, prompt: str) -> dict | None:
        client = AsyncOpenAI(
            base_url=f"{settings.GATEWAY_URL}/v1",
            api_key=settings.GATEWAY_API_KEY,
        )
        try:
            resp = await client.chat.completions.create(
                model=settings.GATEWAY_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                stream=False,
            )
            content = (resp.choices[0].message.content or "").strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                content = content.rsplit("```", 1)[0].strip()
            return json.loads(content)
        except Exception as e:
            logger.warning("PromptEngineer.refine failed: %s", e)
            return None
