import { useState, useMemo, useEffect } from 'react';
import { VoiceManager, loadVoiceSettings, DEFAULT_VOICE_SETTINGS } from '../services/voice/index.js';

// Initialise VoiceManager + écoute des settings (VoiceView émet ws-voice-settings-saved).
// callbacks: { setInput, focusTextarea, sendMessage } — sendMessage est lu via ref pour
// éviter la stale closure quand l'utilisateur déclenche un envoi vocal auto.
export function useVoiceManager({ setInput, focusTextarea, sendMessageRef }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(
    () => (loadVoiceSettings().ttsEnabled ?? DEFAULT_VOICE_SETTINGS.ttsEnabled)
  );
  const [micMode, setMicMode] = useState(
    () => (loadVoiceSettings().micMode ?? DEFAULT_VOICE_SETTINGS.micMode)
  );

  const voiceManager = useMemo(() => {
    const settings = { ...DEFAULT_VOICE_SETTINGS, ...loadVoiceSettings() };
    const vm = new VoiceManager(settings);
    vm.onRecordingChange(setIsRecording);
    vm.onSpeakingChange(setIsSpeaking);
    vm.onInterim((text) => setInput(text));
    vm.onTranscript((text) => {
      setInput(text);
      setTimeout(() => focusTextarea?.(), 50);
    });
    vm.onAutoSend((text) => {
      setInput('');
      sendMessageRef.current?.(text);
    });
    return vm;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup au démontage
  useEffect(() => () => {
    voiceManager.stopSpeaking();
    voiceManager.stopRecording();
  }, [voiceManager]);

  // Sync settings depuis VoiceView
  useEffect(() => {
    const handler = () => {
      const saved = loadVoiceSettings();
      setMicMode(saved.micMode ?? DEFAULT_VOICE_SETTINGS.micMode);
      setTtsEnabled(saved.ttsEnabled ?? DEFAULT_VOICE_SETTINGS.ttsEnabled);
      voiceManager.updateSettings(saved);
    };
    window.addEventListener('ws-voice-settings-saved', handler);
    return () => window.removeEventListener('ws-voice-settings-saved', handler);
  }, [voiceManager]);

  return { voiceManager, isRecording, isSpeaking, ttsEnabled, setTtsEnabled, micMode };
}
