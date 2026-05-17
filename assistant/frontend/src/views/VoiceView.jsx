import { useState, useEffect, useRef } from 'react';
import { loadVoiceSettings, saveVoiceSettings, DEFAULT_VOICE_SETTINGS } from '../services/voice/index.js';
import { getVoiceSettings, saveVoiceSettingsToBackend } from '../services/api.js';

const LANGUAGES = [
  { value: 'fr-FR', label: 'Français (France)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Español' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'pt-BR', label: 'Português (BR)' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'zh-CN', label: '中文 (简体)' },
];

const OPENAI_VOICES = [
  { value: 'alloy', label: 'Alloy — voix neutre' },
  { value: 'echo', label: 'Echo — voix masculine' },
  { value: 'fable', label: 'Fable — voix narrative' },
  { value: 'onyx', label: 'Onyx — voix grave' },
  { value: 'nova', label: 'Nova — voix féminine' },
  { value: 'shimmer', label: 'Shimmer — voix douce' },
];

const KOKORO_VOICES = [
  { value: 'af_heart', label: 'af_heart — féminin (EN)' },
  { value: 'af_sky', label: 'af_sky — féminin doux (EN)' },
  { value: 'af_bella', label: 'af_bella — féminin expressif (EN)' },
  { value: 'af_nicole', label: 'af_nicole — féminin naturel (EN)' },
  { value: 'am_adam', label: 'am_adam — masculin (EN)' },
  { value: 'am_michael', label: 'am_michael — masculin chaleureux (EN)' },
  { value: 'bf_emma', label: 'bf_emma — féminin britannique (EN)' },
  { value: 'bm_george', label: 'bm_george — masculin britannique (EN)' },
];

const s = {
  root: {
    height: '100%',
    overflowY: 'auto',
    padding: '28px 32px',
    background: '#0f0f0f',
    color: '#e8e8e8',
  },
  title: { fontSize: '18px', fontWeight: '600', marginBottom: '6px', color: '#e8e8e8' },
  subtitle: { fontSize: '13px', color: '#6b6b6b', marginBottom: '28px' },
  section: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '16px',
  },
  sectionTitle: { fontSize: '13px', fontWeight: '600', color: '#a0a0a0', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' },
  label: { fontSize: '13px', color: '#c0c0c0', width: '140px', flexShrink: 0 },
  select: {
    flex: 1,
    background: '#111',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#e8e8e8',
    padding: '8px 10px',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
  },
  input: {
    flex: 1,
    background: '#111',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#e8e8e8',
    padding: '8px 10px',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'monospace',
  },
  toggle: (active) => ({
    display: 'flex',
    gap: '6px',
    flex: 1,
  }),
  toggleBtn: (active) => ({
    padding: '7px 16px',
    borderRadius: '8px',
    border: `1px solid ${active ? '#7c3aed66' : '#333'}`,
    background: active ? '#7c3aed22' : 'transparent',
    color: active ? '#a78bfa' : '#6b6b6b',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.15s',
  }),
  hint: { fontSize: '11px', color: '#555', marginTop: '-8px', marginBottom: '14px', paddingLeft: '152px' },
  saveBtn: (saved) => ({
    padding: '10px 24px',
    background: saved ? '#22c55e22' : '#7c3aed',
    border: saved ? '1px solid #22c55e44' : 'none',
    borderRadius: '8px',
    color: saved ? '#22c55e' : '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
  }),
  statusDot: (ok) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: ok ? '#22c55e' : '#555',
    flexShrink: 0,
  }),
  statusLabel: { fontSize: '12px', color: '#6b6b6b' },
  testBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#9a9a9a',
    cursor: 'pointer',
    fontSize: '12px',
  },
  footer: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' },
};

export default function VoiceView() {
  const [localSettings, setLocalSettings] = useState(() => ({
    ...DEFAULT_VOICE_SETTINGS,
    ...loadVoiceSettings(),
  }));
  const [backendSettings, setBackendSettings] = useState(null);
  const [sttKey, setSttKey] = useState('');
  const [ttsKey, setTtsKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    getVoiceSettings().then(vs => {
      if (mountedRef.current && vs) setBackendSettings(vs);
    }).catch(() => {});
    return () => { mountedRef.current = false; };
  }, []);

  function setLocal(key, value) {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    // Save local prefs to localStorage
    saveVoiceSettings(localSettings);

    // Save provider + API keys to backend
    try {
      await saveVoiceSettingsToBackend({
        stt_provider: localSettings.sttProvider,
        tts_provider: localSettings.ttsProvider,
        stt_api_key: sttKey || null,
        tts_api_key: ttsKey || null,
        language: localSettings.language,
        tts_voice: localSettings.ttsVoice,
      });
      const fresh = await getVoiceSettings();
      if (mountedRef.current && fresh) setBackendSettings(fresh);
    } catch (e) {
      console.error('Failed to save voice settings to backend:', e);
    }

    if (!mountedRef.current) return;
    setSaved(true);
    window.dispatchEvent(new CustomEvent('ws-voice-settings-saved'));
    setTimeout(() => { if (mountedRef.current) setSaved(false); }, 2000);
  }

  async function testSTT() {
    setTesting('stt');
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { alert('Web Speech API non supporté dans ce navigateur'); return; }
      const r = new SpeechRecognition();
      r.lang = localSettings.language;
      r.onresult = (e) => {
        alert(`Transcription : "${e.results[0][0].transcript}"`);
      };
      r.onerror = (e) => alert(`Erreur STT : ${e.error}`);
      r.start();
      setTimeout(() => r.stop(), 4000);
    } finally {
      setTesting(null);
    }
  }

  async function testTTS() {
    setTesting('tts');
    try {
      const msg = new SpeechSynthesisUtterance('Test de la synthèse vocale. Bonjour !');
      msg.lang = localSettings.language;
      window.speechSynthesis.speak(msg);
    } finally {
      setTesting(null);
    }
  }

  const webSpeechAvailable = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const webSpeechTTSAvailable = !!window.speechSynthesis;

  return (
    <div style={s.root}>
      <div style={s.title}>🎙️ Voice I/O</div>
      <div style={s.subtitle}>
        Configurez la reconnaissance et la synthèse vocale. Gratuit par défaut via les APIs navigateur.
      </div>

      {/* STT Section */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Reconnaissance vocale (STT)</div>

        <div style={s.row}>
          <span style={s.label}>Provider</span>
          <div style={s.toggle()}>
            <button
              style={s.toggleBtn(localSettings.sttProvider === 'webspeech')}
              onClick={() => setLocal('sttProvider', 'webspeech')}
            >
              🌐 Web Speech
            </button>
            <button
              style={s.toggleBtn(localSettings.sttProvider === 'openai_whisper')}
              onClick={() => setLocal('sttProvider', 'openai_whisper')}
            >
              ✦ OpenAI Whisper
            </button>
            <button
              style={s.toggleBtn(localSettings.sttProvider === 'faster_whisper')}
              onClick={() => setLocal('sttProvider', 'faster_whisper')}
            >
              <span style={{ color: '#22c55e', marginRight: '4px', fontSize: '10px' }}>●</span>
              Whisper local
            </button>
          </div>
        </div>

        {localSettings.sttProvider === 'webspeech' && (
          <div style={s.hint}>
            Gratuit · Natif navigateur · Chrome / Edge recommandé
            {webSpeechAvailable
              ? <span style={{ color: '#22c55e', marginLeft: '8px' }}>✓ Disponible</span>
              : <span style={{ color: '#ef4444', marginLeft: '8px' }}>✗ Non supporté</span>}
          </div>
        )}

        {localSettings.sttProvider === 'openai_whisper' && (
          <>
            <div style={s.row}>
              <span style={s.label}>Clé API OpenAI</span>
              <input
                style={s.input}
                type="password"
                placeholder={backendSettings?.stt_api_key_set ? '••••••••••• (enregistrée)' : 'sk-…'}
                value={sttKey}
                onChange={e => setSttKey(e.target.value)}
              />
            </div>
            <div style={s.hint}>Stockée chiffrée AES-256 · Modèle : whisper-1</div>
          </>
        )}

        {localSettings.sttProvider === 'faster_whisper' && (
          <div style={s.hint}>
            100% local · Aucune clé API · Modèle configurable via{' '}
            <code style={{ color: '#a78bfa' }}>WHISPER_LOCAL_MODEL</code>
            {' '}· Nécessite{' '}
            <code style={{ color: '#a78bfa' }}>LOCAL_VOICE_ENABLED=true</code>
          </div>
        )}

        <div style={s.row}>
          <span style={s.label}>Mode de conversation</span>
          <div style={s.toggle()}>
            <button
              style={s.toggleBtn(localSettings.micMode === 'open_dialogue')}
              onClick={() => setLocal('micMode', 'open_dialogue')}
            >
              💬 Dialogue ouvert
            </button>
            <button
              style={s.toggleBtn(localSettings.micMode === 'push_to_talk')}
              onClick={() => setLocal('micMode', 'push_to_talk')}
            >
              🔘 Push-to-talk
            </button>
          </div>
        </div>
        {localSettings.micMode === 'open_dialogue' && (
          <div style={s.hint}>
            Conversation mains libres · Chaque phrase est envoyée automatiquement ·
            Micro se rouvre après la réponse TTS
          </div>
        )}
        {localSettings.micMode === 'push_to_talk' && (
          <div style={s.hint}>
            Maintenir le bouton 🎙️ pour parler · Relâcher pour envoyer immédiatement ·
            Adapté mobile : appui long = maintien
          </div>
        )}

        {localSettings.sttProvider === 'webspeech' && (
          <div style={s.footer}>
            <button style={s.testBtn} onClick={testSTT} disabled={testing === 'stt'}>
              {testing === 'stt' ? '⏳ Test…' : '▶ Tester le micro'}
            </button>
            <div style={s.statusDot(webSpeechAvailable)} />
            <span style={s.statusLabel}>{webSpeechAvailable ? 'API disponible' : 'API indisponible'}</span>
          </div>
        )}
      </div>

      {/* TTS Section */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Synthèse vocale (TTS)</div>

        <div style={s.row}>
          <span style={s.label}>Provider</span>
          <div style={s.toggle()}>
            <button
              style={s.toggleBtn(localSettings.ttsProvider === 'webspeech')}
              onClick={() => setLocal('ttsProvider', 'webspeech')}
            >
              🌐 Web Speech
            </button>
            <button
              style={s.toggleBtn(localSettings.ttsProvider === 'openai_tts')}
              onClick={() => setLocal('ttsProvider', 'openai_tts')}
            >
              ✦ OpenAI TTS
            </button>
            <button
              style={s.toggleBtn(localSettings.ttsProvider === 'kokoro')}
              onClick={() => setLocal('ttsProvider', 'kokoro')}
            >
              <span style={{ color: '#22c55e', marginRight: '4px', fontSize: '10px' }}>●</span>
              Kokoro local
            </button>
          </div>
        </div>

        {localSettings.ttsProvider === 'webspeech' && (
          <div style={s.hint}>
            Gratuit · Natif navigateur
            {webSpeechTTSAvailable
              ? <span style={{ color: '#22c55e', marginLeft: '8px' }}>✓ Disponible</span>
              : <span style={{ color: '#ef4444', marginLeft: '8px' }}>✗ Non supporté</span>}
          </div>
        )}

        {localSettings.ttsProvider === 'openai_tts' && (
          <>
            <div style={s.row}>
              <span style={s.label}>Clé API OpenAI</span>
              <input
                style={s.input}
                type="password"
                placeholder={backendSettings?.tts_api_key_set ? '••••••••••• (enregistrée)' : 'sk-…'}
                value={ttsKey}
                onChange={e => setTtsKey(e.target.value)}
              />
            </div>
            <div style={s.hint}>Stockée chiffrée AES-256 · Modèle : tts-1</div>

            <div style={s.row}>
              <span style={s.label}>Voix</span>
              <select
                style={s.select}
                value={localSettings.ttsVoice}
                onChange={e => setLocal('ttsVoice', e.target.value)}
              >
                {OPENAI_VOICES.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {localSettings.ttsProvider === 'kokoro' && (
          <>
            <div style={s.row}>
              <span style={s.label}>Voix</span>
              <select
                style={s.select}
                value={localSettings.ttsVoice}
                onChange={e => setLocal('ttsVoice', e.target.value)}
              >
                {KOKORO_VOICES.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div style={s.hint}>
              100% local · Aucune clé API · 82M params · Apache 2.0
              · Optimisé anglais · Nécessite{' '}
              <code style={{ color: '#a78bfa' }}>LOCAL_VOICE_ENABLED=true</code>
            </div>
          </>
        )}

        {localSettings.ttsProvider === 'webspeech' && (
          <div style={s.footer}>
            <button style={s.testBtn} onClick={testTTS} disabled={testing === 'tts'}>
              {testing === 'tts' ? '⏳ Test…' : '▶ Tester la voix'}
            </button>
            <div style={s.statusDot(webSpeechTTSAvailable)} />
            <span style={s.statusLabel}>{webSpeechTTSAvailable ? 'API disponible' : 'API indisponible'}</span>
          </div>
        )}
      </div>

      {/* Language Section */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Langue</div>
        <div style={s.row}>
          <span style={s.label}>Langue vocale</span>
          <select
            style={s.select}
            value={localSettings.language}
            onChange={e => setLocal('language', e.target.value)}
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      <button style={s.saveBtn(saved)} onClick={handleSave}>
        {saved ? '✓ Sauvegardé' : 'Sauvegarder'}
      </button>
    </div>
  );
}
