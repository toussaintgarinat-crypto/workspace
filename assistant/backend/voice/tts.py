from abc import ABC, abstractmethod


OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]


class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str, voice: str, language: str) -> tuple[bytes, str]:
        """Returns (audio_bytes, content_type)."""
        pass


class WebSpeechTTS(TTSProvider):
    """Passthrough — synthesis handled client-side via Web Speech Synthesis API."""
    async def synthesize(self, text: str, voice: str, language: str) -> tuple[bytes, str]:
        raise NotImplementedError("WebSpeech TTS is handled client-side")


class OpenAITTS(TTSProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def synthesize(self, text: str, voice: str, language: str) -> tuple[bytes, str]:
        import httpx
        if voice not in OPENAI_VOICES:
            voice = "alloy"
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": "tts-1", "input": text[:4096], "voice": voice},
            )
        r.raise_for_status()
        return r.content, "audio/mpeg"


def get_tts_provider(provider: str, api_key: str | None = None) -> TTSProvider:
    if provider == "openai_tts":
        if not api_key:
            raise ValueError("OpenAI API key required for OpenAI TTS")
        return OpenAITTS(api_key)
    return WebSpeechTTS()
