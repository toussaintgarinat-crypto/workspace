import { apiFetch } from '../api.js';

// ── Web Speech STT ────────────────────────────────────────────────────────────

export class WebSpeechSTT {
  constructor({ language = 'fr-FR', onInterim, onFinal, onError } = {}) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) throw new Error('Web Speech API not supported in this browser');

    this._recognition = new SpeechRecognition();
    this._recognition.lang = language;
    this._recognition.interimResults = true;
    this._recognition.maxAlternatives = 1;

    this._recognition.onresult = (e) => {
      let interim = '';
      let final = '';
      // Start from e.resultIndex to avoid re-accumulating previous results
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (interim && onInterim) onInterim(interim);
      if (final && onFinal) onFinal(final);
    };

    this._recognition.onerror = (e) => {
      if (onError) onError(e.error);
    };
  }

  start(continuous = false) {
    this._recognition.continuous = continuous;
    this._recognition.start();
  }

  stop() {
    this._recognition.stop();
  }
}

// ── OpenAI Whisper STT (via backend) ─────────────────────────────────────────

export class WhisperSTT {
  constructor({ language = 'fr-FR' } = {}) {
    this._language = language;
    this._mediaRecorder = null;
    this._chunks = [];
  }

  async startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._chunks = [];

    // Prefer webm/opus, fall back to whatever the browser supports
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

    this._mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    this._mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };
    this._mediaRecorder.start();
    this._stream = stream;
  }

  async stopRecording() {
    if (!this._mediaRecorder) return '';
    return new Promise((resolve) => {
      this._mediaRecorder.onstop = async () => {
        const mimeType = this._mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this._chunks, { type: mimeType });
        this._stream?.getTracks().forEach(t => t.stop());

        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');
        formData.append('language', this._language);

        try {
          const res = await apiFetch('/api/v1/voice/transcribe', { method: 'POST', body: formData });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          resolve(data.text || '');
        } catch (err) {
          resolve('');
        }
      };
      this._mediaRecorder.stop();
    });
  }
}
