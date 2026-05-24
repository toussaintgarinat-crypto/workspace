"""Tests for services.voice_service — resolve_stt / resolve_tts."""

import pytest
from fastapi import HTTPException

from services import voice_service


def test_resolve_stt_webspeech_is_client_side():
    with pytest.raises(HTTPException) as exc:
        voice_service.resolve_stt({"stt_provider": "webspeech"})
    assert exc.value.status_code == 400


def test_resolve_stt_unknown_provider():
    with pytest.raises(HTTPException) as exc:
        voice_service.resolve_stt({"stt_provider": "asr-9000"})
    assert exc.value.status_code == 400
    assert "Unknown STT provider" in exc.value.detail


def test_resolve_stt_faster_whisper_requires_local_voice(monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "LOCAL_VOICE_ENABLED", False)
    with pytest.raises(HTTPException) as exc:
        voice_service.resolve_stt({"stt_provider": "faster_whisper"})
    assert exc.value.status_code == 503


def test_resolve_stt_openai_requires_key():
    with pytest.raises(HTTPException) as exc:
        voice_service.resolve_stt({
            "stt_provider": "openai_whisper",
            "stt_api_key_enc": None,
        })
    assert exc.value.status_code == 400


def test_resolve_tts_webspeech_is_client_side():
    with pytest.raises(HTTPException) as exc:
        voice_service.resolve_tts({"tts_provider": "webspeech"}, None)
    assert exc.value.status_code == 400


def test_resolve_tts_unknown_provider():
    with pytest.raises(HTTPException) as exc:
        voice_service.resolve_tts({"tts_provider": "synth-9000"}, None)
    assert exc.value.status_code == 400


def test_resolve_tts_kokoro_requires_local_voice(monkeypatch):
    from config import settings as cfg
    monkeypatch.setattr(cfg, "LOCAL_VOICE_ENABLED", False)
    with pytest.raises(HTTPException) as exc:
        voice_service.resolve_tts({"tts_provider": "kokoro"}, None)
    assert exc.value.status_code == 503


def test_resolve_tts_openai_requires_key():
    with pytest.raises(HTTPException) as exc:
        voice_service.resolve_tts(
            {"tts_provider": "openai_tts", "tts_api_key_enc": None}, None,
        )
    assert exc.value.status_code == 400
