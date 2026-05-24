import { apiFetch } from '../api.js';

// ── Web Speech TTS ────────────────────────────────────────────────────────────

export class WebSpeechTTS {
  constructor({ language = 'fr-FR', voice = null } = {}) {
    this._language = language;
    this._voiceName = voice;
    this._utterance = null;
  }

  speak(text, onEnd) {
    if (!window.speechSynthesis) { onEnd?.(); return; }
    this.stop();
    this._utterance = new SpeechSynthesisUtterance(text);
    this._utterance.lang = this._language;

    if (this._voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.name === this._voiceName);
      if (match) this._utterance.voice = match;
    }

    if (onEnd) this._utterance.onend = onEnd;
    window.speechSynthesis.speak(this._utterance);
  }

  stop() {
    window.speechSynthesis?.cancel();
    this._utterance = null;
  }

  getVoices() {
    return (window.speechSynthesis?.getVoices() || []).filter(v =>
      v.lang.startsWith(this._language.split('-')[0])
    );
  }
}

// ── OpenAI TTS (via backend) ──────────────────────────────────────────────────

export class OpenAITTS {
  constructor({ voice = 'alloy' } = {}) {
    this._voice = voice;
    this._audio = null;
  }

  async speak(text, onEnd) {
    this.stop();
    try {
      const res = await apiFetch('/api/v1/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: this._voice }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      this._audio = new Audio(url);
      this._audio.onended = () => { URL.revokeObjectURL(url); onEnd?.(); };
      await this._audio.play();
    } catch (err) {
      console.error('OpenAI TTS error:', err);
      onEnd?.();
    }
  }

  stop() {
    if (this._audio) {
      this._audio.pause();
      this._audio = null;
    }
  }
}
