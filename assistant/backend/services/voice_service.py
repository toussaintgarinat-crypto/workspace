"""STT/TTS provider resolution for /voice endpoints."""

from fastapi import HTTPException

from config import settings
from vault import decrypt
from voice.stt import get_stt_provider
from voice.tts import get_tts_provider


def resolve_stt(vs: dict):
    """Return an STT provider instance based on voice_settings row."""
    provider = vs.get("stt_provider", "webspeech")

    if provider == "webspeech":
        raise HTTPException(
            status_code=400, detail="WebSpeech STT is handled client-side"
        )

    if provider == "faster_whisper":
        if not settings.LOCAL_VOICE_ENABLED:
            raise HTTPException(
                status_code=503,
                detail="Local voice not enabled — set LOCAL_VOICE_ENABLED=true",
            )
        return get_stt_provider("faster_whisper")

    if provider == "openai_whisper":
        key_enc = vs.get("stt_api_key_enc")
        if not key_enc:
            raise HTTPException(
                status_code=400, detail="OpenAI API key not configured for STT"
            )
        return get_stt_provider("openai_whisper", decrypt(key_enc))

    raise HTTPException(status_code=400, detail=f"Unknown STT provider: {provider}")


def resolve_tts(vs: dict, requested_voice: str | None) -> tuple[object, str]:
    """Return (tts_provider, voice) based on voice_settings row."""
    provider = vs.get("tts_provider", "webspeech")

    if provider == "webspeech":
        raise HTTPException(
            status_code=400, detail="WebSpeech TTS is handled client-side"
        )

    if provider == "kokoro":
        if not settings.LOCAL_VOICE_ENABLED:
            raise HTTPException(
                status_code=503,
                detail="Local voice not enabled — set LOCAL_VOICE_ENABLED=true",
            )
        tts = get_tts_provider("kokoro")
        voice = requested_voice or vs.get("tts_voice", settings.KOKORO_VOICE)
        return tts, voice

    if provider == "openai_tts":
        key_enc = vs.get("tts_api_key_enc")
        if not key_enc:
            raise HTTPException(
                status_code=400, detail="OpenAI API key not configured for TTS"
            )
        tts = get_tts_provider("openai_tts", decrypt(key_enc))
        voice = requested_voice or vs.get("tts_voice", "alloy")
        return tts, voice

    raise HTTPException(status_code=400, detail=f"Unknown TTS provider: {provider}")
