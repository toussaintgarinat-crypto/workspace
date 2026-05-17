import { WebSpeechSTT, WhisperSTT } from './stt.js';
import { WebSpeechTTS, OpenAITTS } from './tts.js';

const SETTINGS_KEY = 'ws_voice_settings';

export function loadVoiceSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveVoiceSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export const DEFAULT_VOICE_SETTINGS = {
  sttProvider: 'webspeech',    // 'webspeech' | 'openai_whisper' | 'faster_whisper'
  ttsProvider: 'webspeech',    // 'webspeech' | 'openai_tts' | 'kokoro'
  language: 'fr-FR',
  ttsVoice: 'alloy',
  micMode: 'push_to_talk',     // 'open_dialogue' | 'push_to_talk'
  ttsEnabled: false,
};

// ── VoiceManager ─────────────────────────────────────────────────────────────

export class VoiceManager {
  constructor(settings = {}) {
    this._settings = { ...DEFAULT_VOICE_SETTINGS, ...settings };
    this._tts = this._buildTTS();
    this._stt = null;
    this._isRecording = false;
    this._isSpeaking = false;
    this._onTranscript = null;      // (text) → put text in field
    this._onAutoSend = null;        // (text) → send message directly
    this._onInterim = null;         // (text) → show interim in field
    this._onRecordingChange = null; // (bool)
    this._onSpeakingChange = null;  // (bool)
  }

  _buildTTS() {
    const { ttsProvider, ttsVoice, language } = this._settings;
    if (ttsProvider === 'openai_tts') return new OpenAITTS({ voice: ttsVoice });
    return new WebSpeechTTS({ language, voice: null });
  }

  updateSettings(settings) {
    this._settings = { ...this._settings, ...settings };
    this._tts = this._buildTTS();
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get isRecording() { return this._isRecording; }
  get isSpeaking() { return this._isSpeaking; }
  get micMode() { return this._settings.micMode; }
  get ttsEnabled() { return this._settings.ttsEnabled; }
  get sttProvider() { return this._settings.sttProvider; }
  get ttsProvider() { return this._settings.ttsProvider; }

  // ── Callbacks ───────────────────────────────────────────────────────────────

  onTranscript(cb) { this._onTranscript = cb; }
  onAutoSend(cb) { this._onAutoSend = cb; }
  onInterim(cb) { this._onInterim = cb; }
  onRecordingChange(cb) { this._onRecordingChange = cb; }
  onSpeakingChange(cb) { this._onSpeakingChange = cb; }

  _setRecording(val) {
    this._isRecording = val;
    this._onRecordingChange?.(val);
  }

  _setSpeaking(val) {
    this._isSpeaking = val;
    this._onSpeakingChange?.(val);
  }

  // ── Internal STT start (shared logic) ───────────────────────────────────────

  async _doStartRecording({ continuous = false, autoSendOnFinal = false } = {}) {
    const { sttProvider, language } = this._settings;

    if (sttProvider === 'openai_whisper' || sttProvider === 'faster_whisper') {
      this._stt = new WhisperSTT({ language });
      await this._stt.startRecording();
      this._setRecording(true);
    } else {
      // WebSpeech STT
      this._stt = new WebSpeechSTT({
        language,
        onInterim: (text) => this._onInterim?.(text),
        onFinal: (text) => {
          if (autoSendOnFinal || this._settings.micMode === 'open_dialogue') {
            // Stop recognition, auto-send
            this._stt?.stop();
            this._setRecording(false);
            this._onAutoSend?.(text);
          } else {
            this._setRecording(false);
            this._onTranscript?.(text);
          }
        },
        onError: () => this._setRecording(false),
      });
      this._stt.start(continuous);
      this._setRecording(true);
    }
  }

  // ── Mode: open_dialogue ─────────────────────────────────────────────────────
  // Click to start conversation session; each sentence auto-sends; mic restarts after TTS.

  async startRecording() {
    if (this._isRecording) {
      await this.stopRecording();
      return;
    }
    if (this._isSpeaking) this.stopSpeaking();

    const { micMode } = this._settings;
    const continuous = micMode === 'open_dialogue';
    await this._doStartRecording({ continuous, autoSendOnFinal: false });
  }

  async stopRecording() {
    if (!this._isRecording) return;
    clearTimeout(this._silenceTimer);

    const { sttProvider } = this._settings;

    if ((sttProvider === 'openai_whisper' || sttProvider === 'faster_whisper') && this._stt instanceof WhisperSTT) {
      this._setRecording(false);
      const text = await this._stt.stopRecording();
      if (text) this._onTranscript?.(text);
    } else if (this._stt instanceof WebSpeechSTT) {
      this._stt.stop();
      this._setRecording(false);
    }
    this._stt = null;
  }

  // ── Mode: push_to_talk ──────────────────────────────────────────────────────
  // pointerdown → startPTT(), pointerup → stopPTT() (auto-sends immediately).

  async startPTT() {
    if (this._isRecording) return;
    if (this._isSpeaking) this.stopSpeaking();
    // Non-continuous, auto-send on final
    await this._doStartRecording({ continuous: false, autoSendOnFinal: true });
  }

  async stopPTT() {
    if (!this._isRecording) return;
    const { sttProvider } = this._settings;

    if ((sttProvider === 'openai_whisper' || sttProvider === 'faster_whisper') && this._stt instanceof WhisperSTT) {
      this._setRecording(false);
      const text = await this._stt.stopRecording();
      if (text) this._onAutoSend?.(text);
      this._stt = null;
    } else if (this._stt instanceof WebSpeechSTT) {
      // WebSpeech: calling .stop() triggers onFinal which handles auto-send
      const stt = this._stt;
      this._stt = null;
      this._setRecording(false);
      stt.stop();
    }
  }

  // ── TTS ────────────────────────────────────────────────────────────────────

  speak(text) {
    if (!this._settings.ttsEnabled) return;
    // Mute mic while TTS speaks (prevents acoustic echo)
    this._setSpeaking(true);
    if (this._isRecording) this.stopRecording();

    const onEnd = () => {
      this._setSpeaking(false);
      // Auto-restart mic in open_dialogue mode
      if (this._settings.micMode === 'open_dialogue' && !this._isRecording) {
        this.startRecording();
      }
    };
    this._tts.speak(text, onEnd);
  }

  stopSpeaking() {
    this._tts.stop();
    this._setSpeaking(false);
  }
}
