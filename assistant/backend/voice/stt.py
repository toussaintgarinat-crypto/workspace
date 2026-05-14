import io
from abc import ABC, abstractmethod


class STTProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_data: bytes, mime_type: str, language: str) -> str:
        pass


class WebSpeechSTT(STTProvider):
    """Passthrough — transcription handled client-side via Web Speech API."""
    async def transcribe(self, audio_data: bytes, mime_type: str, language: str) -> str:
        raise NotImplementedError("WebSpeech STT is handled client-side")


class OpenAIWhisperSTT(STTProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def transcribe(self, audio_data: bytes, mime_type: str, language: str) -> str:
        import httpx
        lang_code = language.split("-")[0]  # fr-FR → fr
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                files={"file": ("audio.webm", io.BytesIO(audio_data), mime_type)},
                data={"model": "whisper-1", "language": lang_code},
            )
        r.raise_for_status()
        return r.json().get("text", "")


def get_stt_provider(provider: str, api_key: str | None = None) -> STTProvider:
    if provider == "openai_whisper":
        if not api_key:
            raise ValueError("OpenAI API key required for Whisper STT")
        return OpenAIWhisperSTT(api_key)
    return WebSpeechSTT()
