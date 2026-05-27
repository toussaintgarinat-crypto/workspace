import { useTranslation } from 'react-i18next';
import Tooltip from '../Tooltip.jsx';
import { s } from './styles.js';
import { loadVoiceSettings, saveVoiceSettings } from '../../services/voice/index.js';

// Bouton micro (push-to-talk ou click-toggle) + bouton TTS on/off.
// Pilote le VoiceManager passé en prop par le parent.
export default function VoiceControlBar({
  voiceManager,
  isRecording,
  isSpeaking,
  ttsEnabled,
  setTtsEnabled,
  micMode,
}) {
  const { t } = useTranslation();
  const isPTT = micMode === 'push_to_talk';
  const micLabel = isPTT
    ? (isRecording ? t('voice.release') : t('voice.holdToSpeak'))
    : (isRecording ? t('voice.clickToStop') : t('voice.startOpenDialog'));

  return (
    <>
      <Tooltip label={micLabel} position="top">
        <button
          className={isRecording ? 'mic-pulse' : ''}
          {...(isPTT
            ? {
                onPointerDown: (e) => { e.currentTarget.setPointerCapture(e.pointerId); voiceManager.startPTT(); },
                onPointerUp: () => voiceManager.stopPTT(),
                onPointerLeave: () => voiceManager.stopPTT(),
              }
            : { onClick: () => voiceManager.startRecording() }
          )}
          style={{
            ...s.micBtn(isRecording || isSpeaking),
            ...(isSpeaking && { color: '#7c3aed', borderColor: '#7c3aed66', background: '#7c3aed11' }),
            ...(isPTT && { userSelect: 'none', touchAction: 'none' }),
          }}
        >
          {isSpeaking ? '🔊' : '🎙️'}
        </button>
      </Tooltip>

      <Tooltip label={ttsEnabled ? t('voice.voiceOn') : t('voice.voiceOff')} position="top">
        <button
          style={s.ttsBtn(ttsEnabled)}
          onClick={() => {
            const next = !ttsEnabled;
            setTtsEnabled(next);
            voiceManager.updateSettings({ ttsEnabled: next });
            const saved = loadVoiceSettings();
            saved.ttsEnabled = next;
            saveVoiceSettings(saved);
            if (!next) voiceManager.stopSpeaking();
          }}
        >
          {ttsEnabled ? '🔊' : '🔇'}
        </button>
      </Tooltip>
    </>
  );
}
