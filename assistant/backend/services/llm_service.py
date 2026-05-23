"""Helpers around the OpenAI-compatible LLM client targeted at the LiteLLM gateway."""

from openai import AsyncOpenAI

from config import settings


def gateway_client(versioned: bool = False) -> AsyncOpenAI:
    """Return an AsyncOpenAI client pointing at the LiteLLM gateway.

    ``versioned=True`` adds the ``/v1`` suffix expected by the chat-completions
    flow used inside ``persona`` inference.
    """
    base_url = f"{settings.GATEWAY_URL}/v1" if versioned else settings.GATEWAY_URL
    return AsyncOpenAI(base_url=base_url, api_key=settings.GATEWAY_API_KEY)
