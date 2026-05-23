import { useRef, useEffect } from 'react';
import Tooltip from '../Tooltip.jsx';
import VoiceControlBar from './VoiceControlBar.jsx';
import { s } from './styles.js';

const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.ogg,.webm,.txt,.md,.csv,.html';

export default function ChatInput({
  input,
  setInput,
  textareaRef,
  onSend,
  isStreaming,
  isUploading,
  onFileSelect,
  compareMode,
  isRecording,
  isSpeaking,
  // Voice
  voiceManager,
  ttsEnabled,
  setTtsEnabled,
  micMode,
  // RAG / PE / Summarize toggles
  ragEnabled,
  setRagEnabled,
  promptEngineerEnabled,
  setPromptEngineerEnabled,
  summarizeEnabled,
  setSummarizeEnabled,
  onTriggerSummarize,
  // Slash menu
  slash,
}) {
  const fileInputRef = useRef(null);
  const internalTextareaRef = useRef(null);
  const taRef = textareaRef || internalTextareaRef;

  function adjustTextarea() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  useEffect(() => { adjustTextarea(); }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleKeyDown(e) {
    if (slash.handleMenuKey(e, (cmd) => { setInput(cmd); taRef.current?.focus(); })) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(input);
    }
  }

  return (
    <>
      {slash.showSlashMenu && slash.filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          left: '20px',
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: '10px',
          padding: '6px',
          zIndex: 100,
          minWidth: '260px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {slash.filtered.map((c, i) => (
            <div
              key={c.cmd}
              style={{
                padding: '8px 12px',
                borderRadius: '7px',
                background: i === slash.slashMenuIdx ? '#7c3aed22' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={() => slash.setSlashMenuIdx(i)}
              onClick={() => { setInput(c.cmd + ' '); slash.setShowSlashMenu(false); taRef.current?.focus(); }}
            >
              <span style={{ fontSize: '13px', color: '#a78bfa', fontFamily: 'monospace' }}>{c.cmd}</span>
              <span style={{ fontSize: '12px', color: '#6b6b6b' }}>{c.desc}</span>
            </div>
          ))}
        </div>
      )}

      <div style={s.inputArea}>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          accept={FILE_ACCEPT}
          onChange={onFileSelect}
        />
        <Tooltip label="Joindre un fichier" position="top">
          <button
            style={s.fileBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || isUploading}
          >
            📎
          </button>
        </Tooltip>
        <textarea
          ref={taRef}
          style={s.textarea}
          value={input}
          onChange={(e) => {
            const val = e.target.value;
            setInput(val);
            slash.onInputChange(val);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isSpeaking ? '🔊 Réponse en cours…' :
            isRecording && micMode === 'push_to_talk' ? '🎙️ Parlez… (relâchez pour envoyer)' :
            isRecording ? '🎙️ Écoute… (phrase détectée → envoi auto)' :
            compareMode ? '⚖ Comparer ce message sur tous les modèles…' :
            'Envoyer un message… (Shift+Entrée pour nouvelle ligne)'
          }
          disabled={isStreaming}
          rows={1}
        />

        <VoiceControlBar
          voiceManager={voiceManager}
          isRecording={isRecording}
          isSpeaking={isSpeaking}
          ttsEnabled={ttsEnabled}
          setTtsEnabled={setTtsEnabled}
          micMode={micMode}
        />

        <Tooltip label={ragEnabled ? 'Mémoire RAG activée' : 'Mémoire RAG désactivée'} position="top">
          <button
            style={s.ragBtn(ragEnabled)}
            onClick={() => {
              const next = !ragEnabled;
              setRagEnabled(next);
              localStorage.setItem('ws_rag_enabled', String(next));
            }}
          >
            🧠
          </button>
        </Tooltip>

        <Tooltip label={summarizeEnabled ? 'Résumer (clic droit pour désactiver)' : 'Résumé auto désactivé'} position="top">
          <button
            style={s.summarizeBtn(summarizeEnabled)}
            onClick={() => {
              if (summarizeEnabled) {
                onTriggerSummarize();
              } else {
                const next = true;
                setSummarizeEnabled(next);
                localStorage.setItem('ws_summarize_enabled', String(next));
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              const next = !summarizeEnabled;
              setSummarizeEnabled(next);
              localStorage.setItem('ws_summarize_enabled', String(next));
            }}
            disabled={isStreaming}
          >
            📝
          </button>
        </Tooltip>

        <Tooltip label={promptEngineerEnabled ? 'Prompt Architect actif' : 'Prompt Architect inactif'} position="top">
          <button
            style={s.peBtn(promptEngineerEnabled)}
            onClick={() => {
              const next = !promptEngineerEnabled;
              setPromptEngineerEnabled(next);
              localStorage.setItem('ws_pe_enabled', String(next));
            }}
          >
            ✦
          </button>
        </Tooltip>

        <Tooltip label="Envoyer le message" position="top">
          <button
            style={s.sendBtn(!input.trim() || isStreaming || isUploading)}
            onClick={() => onSend(input)}
            disabled={!input.trim() || isStreaming || isUploading}
          >
            ↑
          </button>
        </Tooltip>
      </div>
    </>
  );
}
