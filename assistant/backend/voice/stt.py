import io
import os
import asyncio
import tempfile
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


_whisper_model = None


class FasterWhisperSTT(STTProvider):
    """Local Whisper transcription via faster-whisper — no API key required."""

    def __init__(self, model_size: str):
        self.model_size = model_size

    def _get_model(self):
        global _whisper_model
        if _whisper_model is None:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
        return _whisper_model

    async def transcribe(self, audio_data: bytes, mime_type: str, language: str) -> str:
        lang_code = language.split("-")[0]
        model = self._get_model()

        _EXT = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/mpeg": ".mp3"}
        suffix = _EXT.get(mime_type.split(";")[0].strip(), ".webm")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_data)
            tmp_path = f.name

        try:
            loop = asyncio.get_running_loop()
            segments, _ = await loop.run_in_executor(
                None,
                lambda: model.transcribe(tmp_path, language=lang_code),
            )
            return " ".join(s.text.strip() for s in segments)
        finally:
            os.unlink(tmp_path)


def get_stt_provider(provider: str, api_key: str | None = None) -> STTProvider:
    if provider == "openai_whisper":
        if not api_key:
            raise ValueError("OpenAI API key required for Whisper STT")
        return OpenAIWhisperSTT(api_key)
    if provider == "faster_whisper":
        model_size = os.environ.get("WHISPER_LOCAL_MODEL", "base")
        return FasterWhisperSTT(model_size)
    return WebSpeechSTT()
