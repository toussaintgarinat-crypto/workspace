import { useState, useRef, useEffect, useCallback } from 'react';
import { fetchAvailableModels, syncConversation, deleteConversationCloud, addMempalaceDrawer } from '../services/api.js';
import ComparePanel from './ComparePanel.jsx';
import ArtifactPanel from '../components/ArtifactPanel.jsx';
import SessionPanel from '../components/chat/SessionPanel.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import ChatInput from '../components/chat/ChatInput.jsx';
import ChatHeader, { ModelSelector } from '../components/chat/ChatHeader.jsx';
import { s, stripMarkdownForTTS } from '../components/chat/styles.js';
import { newSession, loadSessions, saveSessions, loadCurrentId, saveCurrentId, sessionToMarkdown } from '../components/chat/sessionStorage.js';
import { runSlashCommand } from '../components/chat/slashRunner.js';
import { useChatStream } from '../hooks/useChatStream.js';
import { useSlashCommands } from '../hooks/useSlashCommands.js';
import { useSessionSearch } from '../hooks/useSessionSearch.js';
import { useVoiceManager } from '../hooks/useVoiceManager.js';
import { useUploadHandlers } from '../hooks/useUploadHandlers.js';
import { useConversationSummarizer } from '../hooks/useConversationSummarizer.js';

export default function ChatView() {
  const [sessions, setSessions] = useState(() => {
    const loaded = loadSessions();
    if (loaded.length) return loaded;
    const first = newSession();
    saveSessions([first]);
    return [first];
  });
  const [currentId, setCurrentId] = useState(() => loadCurrentId(loadSessions().length ? loadSessions() : [newSession()]));
  const [showPanel, setShowPanel] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [promptEngineerEnabled, setPromptEngineerEnabled] = useState(() => localStorage.getItem('ws_pe_enabled') === 'true');
  const [ragEnabled, setRagEnabled] = useState(() => localStorage.getItem('ws_rag_enabled') !== 'false');
  const [summarizeEnabled, setSummarizeEnabled] = useState(() => localStorage.getItem('ws_summarize_enabled') !== 'false');
  const [toast, setToast] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('ws_selected_model') || '');
  const [compareMode, setCompareMode] = useState(false);
  const [compareTriggerKey, setCompareTriggerKey] = useState(0);
  const [compareUserText, setCompareUserText] = useState('');
  const [artifactContent, setArtifactContent] = useState(null);
  const [storageMode, setStorageMode] = useState(() => localStorage.getItem('ws_storage_mode') || 'local');
  const sendMessageRef = useRef(null);
  const textareaRef = useRef(null);
  const cloudSyncRef = useRef(null);

  const {
    voiceManager, isRecording, isSpeaking, ttsEnabled, setTtsEnabled, micMode,
  } = useVoiceManager({
    setInput,
    focusTextarea: () => textareaRef.current?.focus(),
    sendMessageRef,
  });

  const slash = useSlashCommands(input);
  const { searchQuery, setSearchQuery, searchResults, searchLoading } = useSessionSearch({ sessions, storageMode });

  const onStreamComplete = useCallback((finalContent) => {
    if (ttsEnabled && finalContent) voiceManager.speak(stripMarkdownForTTS(finalContent));
  }, [ttsEnabled, voiceManager]);

  const { isStreaming, startStream } = useChatStream({ messages, setMessages, onComplete: onStreamComplete });

  const { isUploading, handleFileSelect, handleUploadConfirm, handleUploadCancel } = useUploadHandlers({
    messages, setMessages, isStreaming,
  });

  useEffect(() => { fetchAvailableModels().then(setAvailableModels); }, []);

  // Cloud sync — debounced 2s
  useEffect(() => {
    if (storageMode !== 'cloud' || !currentId || isStreaming) return;
    const session = sessions.find(s => s.id === currentId);
    if (!session || session.messages.length === 0) return;
    clearTimeout(cloudSyncRef.current);
    cloudSyncRef.current = setTimeout(() => { syncConversation(session).catch(() => {}); }, 2000);
    return () => clearTimeout(cloudSyncRef.current);
  }, [sessions, storageMode, currentId, isStreaming]);

  const showToast = useCallback((msg, durationMs = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(null), durationMs);
  }, []);

  const { trigger: triggerSummarize } = useConversationSummarizer({
    messages, currentId, isStreaming, enabled: summarizeEnabled, showToast,
  });

  // Load messages on session switch
  useEffect(() => {
    const session = sessions.find(s => s.id === currentId);
    setMessages(session?.messages || []);
    saveCurrentId(currentId);
  }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save messages to current session
  useEffect(() => {
    if (!currentId || isStreaming) return;
    setSessions(prev => {
      const updated = prev.map(s => s.id === currentId ? { ...s, messages } : s);
      saveSessions(updated);
      return updated;
    });
  }, [messages, isStreaming, currentId]);

  function handleNewSession() {
    if (storageMode === 'mempalace') {
      const current = sessions.find(s => s.id === currentId);
      if (current && current.messages.length > 1) {
        addMempalaceDrawer(sessionToMarkdown(current), 'Input', 'conversations', {
          session_id: current.id,
          title: current.title,
          message_count: String(current.messages.length),
        }).catch(() => {});
      }
    }
    const session = newSession();
    setSessions(prev => { const updated = [...prev, session]; saveSessions(updated); return updated; });
    setCurrentId(session.id);
    setMessages([]);
    setSearchQuery('');
  }

  function handleSelectSession(id) {
    if (id === currentId) return;
    setCurrentId(id);
    setSearchQuery('');
  }

  function handleDeleteSession(id) {
    if (storageMode === 'cloud') deleteConversationCloud(id).catch(() => {});
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      if (!updated.length) {
        const fresh = newSession();
        saveSessions([fresh]);
        setCurrentId(fresh.id);
        setMessages([]);
        return [fresh];
      }
      saveSessions(updated);
      if (id === currentId) setCurrentId(updated[updated.length - 1].id);
      return updated;
    });
  }

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || isUploading) return;
    slash.setShowSlashMenu(false);

    if (compareMode) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = '42px';
      setCompareUserText(trimmed);
      setCompareTriggerKey(k => k + 1);
      return;
    }

    if (trimmed.startsWith('/')) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = '42px';
      const handled = await runSlashCommand({ trimmed, setMessages, setToast, triggerSummarize });
      if (handled) return;
      // Unknown command — fall through to LLM
    }

    // Auto-title from first user message
    const session = sessions.find(s => s.id === currentId);
    if (session && session.title === 'Nouvelle conversation') {
      const title = trimmed.slice(0, 42) + (trimmed.length > 42 ? '…' : '');
      setSessions(prev => {
        const updated = prev.map(s => s.id === currentId ? { ...s, title } : s);
        saveSessions(updated);
        return updated;
      });
    }

    const newMessages = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '42px';

    await startStream(newMessages, {
      promptEngineerEnabled,
      ragEnabled,
      selectedModel: selectedModel || null,
    });
  }

  function handleUseResponse(userText, content) {
    setMessages(prev => [
      ...prev,
      { role: 'user', content: userText },
      { role: 'assistant', content, tools: [] },
    ]);
    setCompareUserText('');
  }

  // Keep the ref up-to-date for VoiceManager auto-send
  sendMessageRef.current = sendMessage;

  const currentSession = sessions.find(s => s.id === currentId);
  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <>
      <div style={s.root}>
        <div style={s.panel(showPanel)}>
          <SessionPanel
            sessions={sessions}
            currentId={currentId}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
            onDelete={handleDeleteSession}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchResults={searchResults}
            searchLoading={searchLoading}
            storageMode={storageMode}
            onStorageModeChange={(mode) => {
              setStorageMode(mode);
              localStorage.setItem('ws_storage_mode', mode);
            }}
          />
        </div>

        {toast && <div style={s.toast}>{typeof toast === 'string' ? toast : toast.msg}</div>}

        <div style={s.chat}>
          <ChatHeader
            showPanel={showPanel}
            setShowPanel={setShowPanel}
            currentTitle={currentSession?.title}
            compareMode={compareMode}
            onToggleCompare={() => { setCompareMode(m => !m); setCompareUserText(''); setCompareTriggerKey(0); }}
          />

          {compareMode ? (
            <ComparePanel
              messages={messages}
              availableModels={availableModels}
              triggerKey={compareTriggerKey}
              userText={compareUserText}
              onUseResponse={handleUseResponse}
            />
          ) : (
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              isEmpty={isEmpty}
              onSuggestion={sendMessage}
              onUploadConfirm={handleUploadConfirm}
              onUploadCancel={handleUploadCancel}
              onOpenArtifact={setArtifactContent}
            />
          )}

          {!compareMode && (
            <ModelSelector
              availableModels={availableModels}
              selectedModel={selectedModel}
              onSelectModel={(v) => { setSelectedModel(v); localStorage.setItem('ws_selected_model', v); }}
            />
          )}

          <ChatInput
            input={input}
            setInput={setInput}
            textareaRef={textareaRef}
            onSend={sendMessage}
            isStreaming={isStreaming}
            isUploading={isUploading}
            onFileSelect={handleFileSelect}
            compareMode={compareMode}
            isRecording={isRecording}
            isSpeaking={isSpeaking}
            voiceManager={voiceManager}
            ttsEnabled={ttsEnabled}
            setTtsEnabled={setTtsEnabled}
            micMode={micMode}
            ragEnabled={ragEnabled}
            setRagEnabled={setRagEnabled}
            promptEngineerEnabled={promptEngineerEnabled}
            setPromptEngineerEnabled={setPromptEngineerEnabled}
            summarizeEnabled={summarizeEnabled}
            setSummarizeEnabled={setSummarizeEnabled}
            onTriggerSummarize={triggerSummarize}
            slash={slash}
          />
        </div>
      </div>

      {artifactContent && (
        <ArtifactPanel content={artifactContent} onClose={() => setArtifactContent(null)} />
      )}
    </>
  );
}
