import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamChat } from '../services/api.js';

// ── Session store ─────────────────────────────────────────────────────────────

function newSession() {
  return {
    id: crypto.randomUUID(),
    title: 'Nouvelle conversation',
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

function loadSessions() {
  try { return JSON.parse(localStorage.getItem('ws_sessions') || '[]'); }
  catch { return []; }
}

function saveSessions(sessions) {
  localStorage.setItem('ws_sessions', JSON.stringify(sessions));
}

function loadCurrentId(sessions) {
  const id = localStorage.getItem('ws_current_session');
  return sessions.find(s => s.id === id) ? id : sessions[0]?.id;
}

function saveCurrentId(id) {
  localStorage.setItem('ws_current_session', id);
}

function relativeDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'À l\'instant';
  if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return 'Aujourd\'hui';
  if (diff < 172800000) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ── Suggestions ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Classer une note',
  'Créer une tâche Forge',
  'Lister mes mondes Oria',
];

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  root: { display: 'flex', height: '100%', overflow: 'hidden' },

  // Sessions panel
  panel: (show) => ({
    width: show ? '220px' : '0',
    overflow: 'hidden',
    transition: 'width 0.2s ease',
    flexShrink: 0,
    background: '#111',
    borderRight: '1px solid #222',
    display: 'flex',
    flexDirection: 'column',
  }),
  panelInner: { width: '220px', display: 'flex', flexDirection: 'column', height: '100%' },
  panelHeader: {
    padding: '14px 12px 10px',
    borderBottom: '1px solid #222',
    flexShrink: 0,
  },
  newBtn: {
    width: '100%',
    padding: '8px 12px',
    background: '#7c3aed22',
    border: '1px solid #7c3aed44',
    borderRadius: '8px',
    color: '#a78bfa',
    cursor: 'pointer',
    fontSize: '13px',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  sessionList: { flex: 1, overflowY: 'auto', padding: '8px 6px' },
  sessionItem: (active) => ({
    padding: '8px 10px',
    borderRadius: '6px',
    background: active ? '#7c3aed18' : 'transparent',
    cursor: 'pointer',
    marginBottom: '2px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    group: true,
  }),
  sessionTitle: (active) => ({
    fontSize: '13px',
    color: active ? '#c4b5fd' : '#9a9a9a',
    fontWeight: active ? '500' : '400',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  }),
  sessionDate: {
    fontSize: '11px',
    color: '#555',
    marginTop: '2px',
    flexShrink: 0,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#555',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '0 2px',
    flexShrink: 0,
    lineHeight: 1,
  },

  // Chat area
  chat: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    padding: '10px 16px',
    borderBottom: '1px solid #1e1e1e',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
    background: '#0f0f0f',
  },
  toggleBtn: {
    background: 'none',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    color: '#6b6b6b',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '14px',
    lineHeight: 1,
  },
  sessionTitleDisplay: {
    fontSize: '13px',
    color: '#5a5a5a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 0 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    color: '#6b6b6b',
  },
  emptyTitle: { fontSize: '18px', color: '#e8e8e8', fontWeight: '500' },
  suggestions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '500px',
  },
  suggestionBtn: {
    padding: '8px 14px',
    border: '1px solid #2a2a2a',
    borderRadius: '20px',
    background: '#1a1a1a',
    color: '#a0a0a0',
    cursor: 'pointer',
    fontSize: '13px',
  },
  msgWrapper: (role) => ({
    display: 'flex',
    justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
    padding: '0 20px',
  }),
  bubble: (role) => ({
    maxWidth: '72%',
    padding: '10px 14px',
    borderRadius: role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
    background: role === 'user' ? '#4c1d95' : '#1e1e1e',
    color: '#e8e8e8',
    fontSize: '14px',
    lineHeight: '1.6',
    border: role === 'user' ? 'none' : '1px solid #2a2a2a',
  }),

  // Tool cards
  toolsWrapper: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' },
  toolCard: {
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #2a2a2a',
    fontSize: '12px',
  },
  toolHeader: (isError, isRunning) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 8px',
    background: '#161616',
    border: 'none',
    cursor: isRunning ? 'default' : 'pointer',
    textAlign: 'left',
    color: isError ? '#ef4444' : isRunning ? '#9a9a9a' : '#22c55e',
  }),
  toolName: { color: '#b0b0b0', fontFamily: 'monospace', flex: 1 },
  toolChevron: { color: '#555', marginLeft: '4px' },
  toolBody: {
    padding: '8px',
    background: '#111',
    borderTop: '1px solid #222',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  toolLabel: { fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' },
  toolPre: {
    margin: 0,
    padding: '6px',
    background: '#0a0a0a',
    borderRadius: '4px',
    color: '#9b9b9b',
    fontSize: '11px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '160px',
    overflowY: 'auto',
    fontFamily: 'monospace',
  },

  streamingDots: { padding: '10px 20px' },
  inputArea: {
    padding: '12px 20px',
    borderTop: '1px solid #2a2a2a',
    background: '#0f0f0f',
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
    color: '#e8e8e8',
    padding: '10px 14px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    minHeight: '42px',
    maxHeight: '120px',
    lineHeight: '1.5',
  },
  sendBtn: (disabled) => ({
    padding: '10px 16px',
    background: disabled ? '#2a2a2a' : '#7c3aed',
    border: 'none',
    borderRadius: '10px',
    color: disabled ? '#6b6b6b' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '16px',
    flexShrink: 0,
    height: '42px',
  }),
  peBtn: (active) => ({
    padding: '0 12px',
    height: '42px',
    background: active ? '#7c3aed22' : 'transparent',
    border: `1px solid ${active ? '#7c3aed66' : '#333'}`,
    borderRadius: '10px',
    color: active ? '#a78bfa' : '#555',
    cursor: 'pointer',
    fontSize: '14px',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  }),
  refinedBadge: {
    display: 'inline-block',
    marginTop: '4px',
    fontSize: '10px',
    color: '#7c3aed99',
    letterSpacing: '0.05em',
  },
};

// ── ToolCard ──────────────────────────────────────────────────────────────────

function ToolCard({ tool }) {
  const [open, setOpen] = useState(false);
  const { name, args, result, status } = tool;
  const isRunning = status === 'running';
  const isError = status === 'error';

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.tool-spin{display:inline-block;animation:spin 0.9s linear infinite}`}</style>
      <div style={s.toolCard}>
        <button style={s.toolHeader(isError, isRunning)} onClick={() => !isRunning && setOpen(!open)}>
          <span className={isRunning ? 'tool-spin' : ''}>
            {isRunning ? '◐' : isError ? '✗' : '✓'}
          </span>
          <span style={s.toolName}>{name.replace(/_/g, ' ')}</span>
          {!isRunning && (
            <span style={s.toolChevron}>{open ? '▲' : '▼'}</span>
          )}
        </button>
        {open && !isRunning && (
          <div style={s.toolBody}>
            {args && Object.keys(args).length > 0 && (
              <>
                <div style={s.toolLabel}>Paramètres</div>
                <pre style={s.toolPre}>{JSON.stringify(args, null, 2)}</pre>
              </>
            )}
            {result !== undefined && result !== null && (
              <>
                <div style={s.toolLabel}>Résultat</div>
                <pre style={s.toolPre}>
                  {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Message ───────────────────────────────────────────────────────────────────

function Message({ msg }) {
  return (
    <div className="msg-enter" style={s.msgWrapper(msg.role)}>
      <div style={s.bubble(msg.role)}>
        {msg.role === 'assistant' ? (
          <div className="markdown-body">
            <ReactMarkdown>{msg.content || ''}</ReactMarkdown>
          </div>
        ) : (
          <>
            <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
            {msg.refined && (
              <div style={s.refinedBadge}>✦ affiné</div>
            )}
          </>
        )}
        {msg.tools && msg.tools.length > 0 && (
          <div style={s.toolsWrapper}>
            {msg.tools.map((t, i) => <ToolCard key={i} tool={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SessionPanel ──────────────────────────────────────────────────────────────

function SessionPanel({ sessions, currentId, onSelect, onNew, onDelete }) {
  return (
    <div style={s.panelInner}>
      <div style={s.panelHeader}>
        <button style={s.newBtn} onClick={onNew}>
          <span>＋</span> Nouvelle conversation
        </button>
      </div>
      <div style={s.sessionList}>
        {[...sessions].reverse().map(session => (
          <div
            key={session.id}
            style={s.sessionItem(session.id === currentId)}
            onClick={() => onSelect(session.id)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.sessionTitle(session.id === currentId)}>
                {session.title}
              </div>
              <div style={s.sessionDate}>{relativeDate(session.createdAt)}</div>
            </div>
            <button
              style={s.deleteBtn}
              onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
              title="Supprimer"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ChatView ──────────────────────────────────────────────────────────────────

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
  const [isStreaming, setIsStreaming] = useState(false);
  const [promptEngineerEnabled, setPromptEngineerEnabled] = useState(
    () => localStorage.getItem('ws_pe_enabled') === 'true'
  );

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const assistantIdxRef = useRef(null);

  // Load messages when session switches
  useEffect(() => {
    const session = sessions.find(s => s.id === currentId);
    setMessages(session?.messages || []);
    saveCurrentId(currentId);
  }, [currentId]);

  // Auto-save messages to current session
  useEffect(() => {
    if (!currentId || isStreaming) return;
    setSessions(prev => {
      const updated = prev.map(s => s.id === currentId ? { ...s, messages } : s);
      saveSessions(updated);
      return updated;
    });
  }, [messages, isStreaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function adjustTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function handleNewSession() {
    const session = newSession();
    setSessions(prev => {
      const updated = [...prev, session];
      saveSessions(updated);
      return updated;
    });
    setCurrentId(session.id);
    setMessages([]);
  }

  function handleSelectSession(id) {
    if (id === currentId) return;
    setCurrentId(id);
  }

  function handleDeleteSession(id) {
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
      if (id === currentId) {
        const next = updated[updated.length - 1];
        setCurrentId(next.id);
      }
      return updated;
    });
  }

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

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

    const userMsg = { role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '42px';
    setIsStreaming(true);

    const assistantIdx = newMessages.length;
    assistantIdxRef.current = assistantIdx;
    setMessages(prev => [...prev, { role: 'assistant', content: '', tools: [] }]);

    try {
      await streamChat(
        newMessages,
        // onChunk
        (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            const idx = assistantIdxRef.current;
            updated[idx] = { ...updated[idx], content: updated[idx].content + chunk };
            return updated;
          });
        },
        // onToolStart
        (name, args) => {
          setMessages(prev => {
            const updated = [...prev];
            const idx = assistantIdxRef.current;
            const msg = { ...updated[idx] };
            msg.tools = [...(msg.tools || []), { name, args, result: null, status: 'running' }];
            updated[idx] = msg;
            return updated;
          });
        },
        // onTool (result)
        (name, result, error) => {
          setMessages(prev => {
            const updated = [...prev];
            const idx = assistantIdxRef.current;
            const msg = { ...updated[idx] };
            const toolIdx = [...msg.tools].reverse().findIndex(t => t.name === name && t.status === 'running');
            const realIdx = toolIdx >= 0 ? msg.tools.length - 1 - toolIdx : -1;
            if (realIdx >= 0) {
              msg.tools = msg.tools.map((t, i) =>
                i === realIdx ? { ...t, result, status: error ? 'error' : 'success' } : t
              );
            }
            updated[idx] = msg;
            return updated;
          });
        },
        // onDone
        () => setIsStreaming(false),
        // usePromptEngineer
        promptEngineerEnabled,
        // onPromptRefined — mark user message with refined badge
        () => {
          setMessages(prev => {
            const updated = [...prev];
            const userIdx = assistantIdxRef.current - 1;
            if (userIdx >= 0) {
              updated[userIdx] = { ...updated[userIdx], refined: true };
            }
            return updated;
          });
        },
      );
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        const idx = assistantIdxRef.current;
        updated[idx] = { ...updated[idx], content: `Erreur : ${err.message}` };
        return updated;
      });
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const currentSession = sessions.find(s => s.id === currentId);
  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div style={s.root}>
      {/* Sessions panel */}
      <div style={s.panel(showPanel)}>
        <SessionPanel
          sessions={sessions}
          currentId={currentId}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
          onDelete={handleDeleteSession}
        />
      </div>

      {/* Chat area */}
      <div style={s.chat}>
        <div style={s.header}>
          <button style={s.toggleBtn} onClick={() => setShowPanel(!showPanel)} title="Sessions">
            ☰
          </button>
          <span style={s.sessionTitleDisplay}>
            {currentSession?.title || 'Conversation'}
          </span>
        </div>

        {isEmpty ? (
          <div style={s.emptyState}>
            <p style={s.emptyTitle}>Bonjour, comment puis-je vous aider ?</p>
            <div style={s.suggestions}>
              {SUGGESTIONS.map((sug) => (
                <button key={sug} style={s.suggestionBtn} onClick={() => sendMessage(sug)}>
                  {sug}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={s.messageList}>
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <div style={s.streamingDots}>
                <span className="streaming-dots">
                  <span>●</span><span>●</span><span>●</span>
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        <div style={s.inputArea}>
          <textarea
            ref={textareaRef}
            style={s.textarea}
            value={input}
            onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder="Envoyer un message… (Shift+Entrée pour nouvelle ligne)"
            disabled={isStreaming}
            rows={1}
          />
          <button
            style={s.peBtn(promptEngineerEnabled)}
            onClick={() => {
              const next = !promptEngineerEnabled;
              setPromptEngineerEnabled(next);
              localStorage.setItem('ws_pe_enabled', String(next));
            }}
            title={promptEngineerEnabled ? 'Prompt Architect actif' : 'Prompt Architect inactif'}
          >
            ✦
          </button>
          <button
            style={s.sendBtn(!input.trim() || isStreaming)}
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
