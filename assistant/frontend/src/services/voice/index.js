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
  sttProvider: 'webspeech',  // 'webspeech' | 'openai_whisper'
  ttsProvider: 'webspeech',  // 'webspeech' | 'openai_tts'
  language: 'fr-FR',
  ttsVoice: 'alloy',
  micMode: 'push_to_talk',   // 'push_to_talk' | 'auto_silence'
  ttsEnabled: false,
};

// ── VoiceManager ─────────────────────────────────────────────────────────────

export class VoiceManager {
  constructor(settings = {}) {
    this._settings = { ...DEFAULT_VOICE_SETTINGS, ...settings };
    this._tts = this._buildTTS();
    this._stt = null;
    this._isRecording = false;
    this._onTranscript = null;  // callback(text: string)
    this._onInterim = null;     // callback(text: string)
    this._onRecordingChange = null; // callback(isRecording: bool)
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

  get isRecording() { return this._isRecording; }

  onTranscript(cb) { this._onTranscript = cb; }
  onInterim(cb) { this._onInterim = cb; }
  onRecordingChange(cb) { this._onRecordingChange = cb; }

  _setRecording(val) {
    this._isRecording = val;
    this._onRecordingChange?.(val);
  }

  // ── STT: start ─────────────────────────────────────────────────────────────

  async startRecording() {
    if (this._isRecording) {
      await this.stopRecording();
      return;
    }

    const { sttProvider, language, micMode } = this._settings;

    if (sttProvider === 'openai_whisper') {
      this._stt = new WhisperSTT({ language });
      await this._stt.startRecording();
      this._setRecording(true);

      if (micMode === 'auto_silence') {
        // For Whisper + auto silence: stop after 5s of silence (heuristic via timeout)
        this._silenceTimer = setTimeout(() => this.stopRecording(), 8000);
      }
    } else {
      // WebSpeech STT
      this._stt = new WebSpeechSTT({
        language,
        onInterim: (text) => this._onInterim?.(text),
        onFinal: (text) => {
          this._setRecording(false);
          this._onTranscript?.(text);
        },
        onError: () => this._setRecording(false),
      });
      const continuous = micMode === 'push_to_talk';
      this._stt.start(continuous);
      this._setRecording(true);
    }
  }

  async stopRecording() {
    if (!this._isRecording) return;
    clearTimeout(this._silenceTimer);

    const { sttProvider } = this._settings;

    if (sttProvider === 'openai_whisper' && this._stt instanceof WhisperSTT) {
      this._setRecording(false);
      const text = await this._stt.stopRecording();
      if (text) this._onTranscript?.(text);
    } else if (this._stt instanceof WebSpeechSTT) {
      this._stt.stop();
      this._setRecording(false);
    }
    this._stt = null;
  }

  // ── TTS ────────────────────────────────────────────────────────────────────

  speak(text) {
    if (!this._settings.ttsEnabled) return;
    this._tts.speak(text);
  }

  stopSpeaking() {
    this._tts.stop();
  }

  get ttsEnabled() { return this._settings.ttsEnabled; }
  get micMode() { return this._settings.micMode; }
  get sttProvider() { return this._settings.sttProvider; }
  get ttsProvider() { return this._settings.ttsProvider; }
}
