import io
import logging
import os
import asyncio
import wave
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]

KOKORO_VOICES = [
    "af_heart", "af_sky", "af_bella", "af_nicole",
    "am_adam", "am_michael",
    "bf_emma", "bf_isabella",
    "bm_george", "bm_lewis",
]


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


_kokoro_pipeline = None


class KokoroTTS(TTSProvider):
    """Local TTS via Kokoro (82M params, Apache 2.0) — no API key required."""

    def __init__(self, default_voice: str):
        self.default_voice = default_voice

    def _get_pipeline(self):
        global _kokoro_pipeline
        if _kokoro_pipeline is None:
            from kokoro import KPipeline
            lang_code = os.environ.get("KOKORO_LANG", "a")  # 'a'=American EN, 'b'=British EN
            _kokoro_pipeline = KPipeline(lang_code=lang_code)
        return _kokoro_pipeline

    async def synthesize(self, text: str, voice: str, language: str) -> tuple[bytes, str]:
        import numpy as np

        lang_prefix = language.split("-")[0].lower()
        if lang_prefix not in ("en", "a", "b"):
            logger.warning("Kokoro only supports English; language=%s will likely produce garbled output", language)

        pipeline = self._get_pipeline()
        voice_id = voice if voice in KOKORO_VOICES else self.default_voice

        loop = asyncio.get_running_loop()

        def _synth():
            chunks = []
            for _, _, audio in pipeline(text[:4096], voice=voice_id, speed=1.0):
                if audio is not None:
                    chunks.append(audio)
            if not chunks:
                return b""
            combined = np.concatenate(chunks)
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes((combined * 32767).astype(np.int16).tobytes())
            return buf.getvalue()

        audio_bytes = await loop.run_in_executor(None, _synth)
        return audio_bytes, "audio/wav"


def get_tts_provider(provider: str, api_key: str | None = None) -> TTSProvider:
    if provider == "openai_tts":
        if not api_key:
            raise ValueError("OpenAI API key required for OpenAI TTS")
        return OpenAITTS(api_key)
    if provider == "kokoro":
        default_voice = os.environ.get("KOKORO_VOICE", "af_heart")
        return KokoroTTS(default_voice)
    return WebSpeechTTS()
