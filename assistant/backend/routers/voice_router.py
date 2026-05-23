"""STT/TTS settings + transcribe/synthesize endpoints."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from db import get_voice_settings, upsert_voice_settings
from models.schemas import SynthesizeBody, VoiceSettingsBody
from services.voice_service import resolve_stt, resolve_tts
from vault import encrypt

router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/settings")
async def voice_get_settings():
    vs = await get_voice_settings()
    return {
        "stt_provider": vs.get("stt_provider", "webspeech"),
        "tts_provider": vs.get("tts_provider", "webspeech"),
        "stt_api_key_set": bool(vs.get("stt_api_key_enc")),
        "tts_api_key_set": bool(vs.get("tts_api_key_enc")),
        "language": vs.get("language", "fr-FR"),
        "tts_voice": vs.get("tts_voice", "alloy"),
    }


@router.post("/settings")
async def voice_save_settings(body: VoiceSettingsBody):
    current = await get_voice_settings()

    stt_enc = current.get("stt_api_key_enc")
    if body.stt_api_key is not None:
        stt_enc = encrypt(body.stt_api_key) if body.stt_api_key else None

    tts_enc = current.get("tts_api_key_enc")
    if body.tts_api_key is not None:
        tts_enc = encrypt(body.tts_api_key) if body.tts_api_key else None

    await upsert_voice_settings(
        stt_provider=body.stt_provider,
        tts_provider=body.tts_provider,
        stt_api_key_enc=stt_enc,
        tts_api_key_enc=tts_enc,
        language=body.language,
        tts_voice=body.tts_voice,
    )
    return {"saved": True}


@router.post("/transcribe")
async def voice_transcribe(
    audio: UploadFile = File(...),
    language: str = Form(default="fr-FR"),
):
    vs = await get_voice_settings()
    stt = resolve_stt(vs)
    audio_data = await audio.read()
    text = await stt.transcribe(
        audio_data, audio.content_type or "audio/webm", language
    )
    return {"text": text}


@router.post("/synthesize")
async def voice_synthesize(body: SynthesizeBody):
    if not body.text:
        raise HTTPException(status_code=400, detail="No text provided")

    vs = await get_voice_settings()
    tts, voice = resolve_tts(vs, body.voice)
    audio_bytes, content_type = await tts.synthesize(
        body.text, voice, vs.get("language", "fr-FR")
    )
    return Response(content=audio_bytes, media_type=content_type)
