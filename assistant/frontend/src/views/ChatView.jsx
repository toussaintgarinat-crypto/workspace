import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamChat } from '../services/api.js';

const SUGGESTIONS = [
  'Classer une note',
  'Créer une tâche Forge',
  'Lister mes mondes Oria',
];

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 0',
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
  emptyTitle: {
    fontSize: '18px',
    color: '#e8e8e8',
    fontWeight: '500',
  },
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
    transition: 'border-color 0.15s, color 0.15s',
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
  toolBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: '#2a2a2a',
    border: '1px solid #3a3a3a',
    borderRadius: '4px',
    padding: '2px 7px',
    fontSize: '11px',
    color: '#9b9b9b',
    cursor: 'pointer',
    margin: '4px 2px 0',
    transition: 'background 0.15s',
  },
  toolResult: {
    marginTop: '6px',
    padding: '8px',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#9b9b9b',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '150px',
    overflowY: 'auto',
  },
  streamingDots: {
    padding: '10px 20px',
  },
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
    transition: 'border-color 0.15s',
  },
  sendBtn: (disabled) => ({
    padding: '10px 16px',
    background: disabled ? '#2a2a2a' : '#7c3aed',
    border: 'none',
    borderRadius: '10px',
    color: disabled ? '#6b6b6b' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '16px',
    transition: 'background 0.15s',
    flexShrink: 0,
    height: '42px',
  }),
};

function ToolBadge({ name, result }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span style={s.toolBadge} onClick={() => setOpen(!open)}>
        ⚙ {name}
      </span>
      {open && result && (
        <div style={s.toolResult}>
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </div>
      )}
    </div>
  );
}

function Message({ msg }) {
  return (
    <div className="msg-enter" style={s.msgWrapper(msg.role)}>
      <div style={s.bubble(msg.role)}>
        {msg.role === 'assistant' ? (
          <div className="markdown-body">
            <ReactMarkdown>{msg.content || ''}</ReactMarkdown>
          </div>
        ) : (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        )}
        {msg.tools && msg.tools.length > 0 && (
          <div>
            {msg.tools.map((t, i) => (
              <ToolBadge key={i} name={t.name} result={t.result} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatView() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function adjustTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMsg = { role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    const assistantIdx = newMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '', tools: [] }]);

    try {
      await streamChat(
        newMessages,
        (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantIdx] = {
              ...updated[assistantIdx],
              content: updated[assistantIdx].content + chunk,
            };
            return updated;
          });
        },
        (name, result) => {
          setMessages(prev => {
            const updated = [...prev];
            updated[assistantIdx] = {
              ...updated[assistantIdx],
              tools: [...(updated[assistantIdx].tools || []), { name, result }],
            };
            return updated;
          });
        },
        () => {
          setIsStreaming(false);
        }
      );
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantIdx] = {
          ...updated[assistantIdx],
          content: `Erreur : ${err.message}`,
        };
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

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div style={s.container}>
      {isEmpty ? (
        <div style={s.emptyState}>
          <p style={s.emptyTitle}>Bonjour, comment puis-je vous aider ?</p>
          <div style={s.suggestions}>
            {SUGGESTIONS.map((sug) => (
              <button
                key={sug}
                style={s.suggestionBtn}
                onClick={() => sendMessage(sug)}
              >
                {sug}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={s.messageList}>
          {messages.map((msg, i) => (
            <Message key={i} msg={msg} />
          ))}
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
          style={s.sendBtn(!input.trim() || isStreaming)}
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isStreaming}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
