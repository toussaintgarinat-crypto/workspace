import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamChat, uploadFile, confirmDocument, summarizeConversation, fetchAvailableModels, syncConversation, searchConversations, deleteConversationCloud, addMempalaceDrawer, mempalaceSearch } from '../services/api.js';
import { VoiceManager, loadVoiceSettings, saveVoiceSettings, DEFAULT_VOICE_SETTINGS } from '../services/voice/index.js';
import Tooltip from '../components/Tooltip.jsx';
import ComparePanel from './ComparePanel.jsx';

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
  try {
    const raw = JSON.parse(localStorage.getItem('ws_sessions') || '[]');
    // Drop stale pending upload proposals — their file_id is gone after reload
    return raw.map(s => ({
      ...s,
      messages: (s.messages || []).map(m =>
        m.uploadProposal?.status === 'pending'
          ? { ...m, uploadProposal: { ...m.uploadProposal, status: 'cancelled' } }
          : m
      ),
    }));
  } catch { return []; }
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

const IPCRA_WINGS = ['Input', 'Projet', 'Casquette', 'Ressource', 'Archive'];
const SUMMARIZE_THRESHOLD = 20;
const MAX_CONTEXT_MESSAGES = 30;

function stripMarkdownForTTS(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')       // code blocks
    .replace(/`[^`]+`/g, '')              // inline code
    .replace(/#{1,6}\s+/gm, '')           // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // bold
    .replace(/\*([^*]+)\*/g, '$1')        // italic
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // links
    .replace(/^[-*+]\s+/gm, '')           // unordered list
    .replace(/^\d+\.\s+/gm, '')           // ordered list
    .replace(/\n{3,}/g, '\n')             // excess newlines
    .trim();
}

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
  searchBox: {
    margin: '8px 8px 4px',
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    padding: '5px 8px 5px 26px',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    color: '#e0e0e0',
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  searchIcon: {
    position: 'absolute',
    left: '7px',
    top: '6px',
    color: '#555',
    fontSize: '13px',
    pointerEvents: 'none',
  },
  storageBar: {
    display: 'flex',
    gap: '4px',
    padding: '8px 8px',
    borderTop: '1px solid #1c1c1c',
    flexShrink: 0,
  },
  storageBtn: (active) => ({
    flex: 1,
    padding: '4px 2px',
    background: active ? '#7c3aed33' : 'transparent',
    border: `1px solid ${active ? '#7c3aed66' : '#222'}`,
    borderRadius: '6px',
    color: active ? '#c4b5fd' : '#555',
    cursor: 'pointer',
    fontSize: '13px',
    textAlign: 'center',
  }),
  snippetText: {
    fontSize: '11px',
    color: '#555',
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  micBtn: (recording) => ({
    width: '42px',
    height: '42px',
    background: recording ? '#ef444422' : 'transparent',
    border: `1px solid ${recording ? '#ef444466' : '#333'}`,
    borderRadius: '10px',
    color: recording ? '#ef4444' : '#555',
    cursor: 'pointer',
    fontSize: '16px',
    flexShrink: 0,
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  }),
  ttsBtn: (active) => ({
    width: '42px',
    height: '42px',
    background: active ? '#0891b222' : 'transparent',
    border: `1px solid ${active ? '#0891b266' : '#333'}`,
    borderRadius: '10px',
    color: active ? '#22d3ee' : '#555',
    cursor: 'pointer',
    fontSize: '15px',
    flexShrink: 0,
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  refinedBadge: {
    display: 'inline-block',
    marginTop: '4px',
    fontSize: '10px',
    color: '#7c3aed99',
    letterSpacing: '0.05em',
  },

  // RAG chip & panel
  ragChip: {
    background: 'none',
    border: 'none',
    color: '#22d3ee',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '2px 4px',
    marginTop: '3px',
    opacity: 0.65,
    display: 'inline-block',
  },
  ragPanel: {
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '10px',
    marginTop: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '360px',
    marginLeft: 'auto',
  },
  ragEntry: {
    fontSize: '12px',
    borderLeft: '2px solid #06b6d444',
    paddingLeft: '8px',
  },
  ragEntryMeta: {
    color: '#22d3ee',
    fontSize: '10px',
    fontWeight: '600',
    marginBottom: '2px',
  },
  ragEntryContent: {
    color: '#9b9b9b',
    lineHeight: '1.5',
    wordBreak: 'break-word',
  },
  ragBtn: (active) => ({
    padding: '0 12px',
    height: '42px',
    background: active ? '#06b6d422' : 'transparent',
    border: `1px solid ${active ? '#06b6d466' : '#333'}`,
    borderRadius: '10px',
    color: active ? '#22d3ee' : '#555',
    cursor: 'pointer',
    fontSize: '14px',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  }),
  summarizeBtn: (active) => ({
    padding: '0 12px',
    height: '42px',
    background: active ? '#059669' + '22' : 'transparent',
    border: `1px solid ${active ? '#059669' + '66' : '#333'}`,
    borderRadius: '10px',
    color: active ? '#34d399' : '#555',
    cursor: 'pointer',
    fontSize: '14px',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  }),
  fileBtn: {
    width: '42px',
    height: '42px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: '10px',
    color: '#555',
    cursor: 'pointer',
    fontSize: '16px',
    flexShrink: 0,
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#e8e8e8',
    zIndex: 9999,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    transition: 'opacity 0.3s ease',
  },
  uploadCard: {
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '12px 14px',
    marginTop: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  uploadCardTitle: {
    color: '#c4b5fd',
    fontSize: '13px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  uploadCardSummary: {
    color: '#b0b0b0',
    fontSize: '13px',
    lineHeight: '1.55',
  },
  uploadCardProposal: {
    color: '#9b9b9b',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexWrap: 'wrap',
  },
  uploadCardWing: { color: '#a78bfa', fontWeight: '600' },
  uploadCardActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '2px',
  },
  uploadCardBtn: (variant) => ({
    padding: '5px 12px',
    borderRadius: '6px',
    border: variant === 'cancel' ? '1px solid #333' : 'none',
    cursor: 'pointer',
    fontSize: '12px',
    background: variant === 'confirm' ? '#7c3aed' : variant === 'edit' ? '#1a1a1a' : 'transparent',
    color: variant === 'confirm' ? '#fff' : variant === 'edit' ? '#b0b0b0' : '#555',
  }),
  uploadEditRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  uploadSelect: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#e0e0e0',
    padding: '4px 8px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  uploadRoomInput: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#e0e0e0',
    padding: '4px 8px',
    fontSize: '12px',
    flex: 1,
    outline: 'none',
    minWidth: '120px',
  },
  uploadStatusOk: { fontSize: '12px', color: '#22c55e' },
  uploadStatusErr: { fontSize: '12px', color: '#ef4444' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ── UploadProposal ────────────────────────────────────────────────────────────

function UploadProposal({ proposal, onConfirm, onCancel }) {
  const [wing, setWing] = useState(proposal.proposed_wing || 'Ressource');
  const [room, setRoom] = useState(proposal.proposed_room || 'documents');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (proposal.status === 'cancelled') return null;

  if (proposal.status === 'confirmed') {
    return (
      <div style={s.uploadCard}>
        <div style={s.uploadCardTitle}>📄 {proposal.filename}</div>
        <div style={s.uploadStatusOk}>✓ Classé dans {proposal.final_wing} › {proposal.final_room}</div>
      </div>
    );
  }

  if (proposal.status === 'loading') {
    return (
      <div style={s.uploadCard}>
        <div style={s.uploadCardTitle}>
          <span className="tool-spin">◐</span> {proposal.filename} — Analyse en cours…
        </div>
      </div>
    );
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(wing, room);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div style={s.uploadCard}>
      <div style={s.uploadCardTitle}>
        📄 {proposal.filename}
        {proposal.size ? <span style={{ color: '#555', fontWeight: 400 }}>{formatSize(proposal.size)}</span> : null}
      </div>
      {proposal.summary && <div style={s.uploadCardSummary}>{proposal.summary}</div>}
      <div style={s.uploadCardProposal}>
        Proposition : <span style={s.uploadCardWing}>{wing}</span> › {room}
      </div>
      {editing && (
        <div style={s.uploadEditRow}>
          <select style={s.uploadSelect} value={wing} onChange={e => setWing(e.target.value)}>
            {IPCRA_WINGS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <input
            style={s.uploadRoomInput}
            value={room}
            onChange={e => setRoom(e.target.value)}
            placeholder="sous-catégorie"
          />
        </div>
      )}
      {error && <div style={s.uploadStatusErr}>✗ {error}</div>}
      <div style={s.uploadCardActions}>
        <button style={s.uploadCardBtn('confirm')} onClick={handleConfirm} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Confirmer'}
        </button>
        <button style={s.uploadCardBtn('edit')} onClick={() => setEditing(!editing)}>
          {editing ? 'Fermer' : 'Modifier'}
        </button>
        <button style={s.uploadCardBtn('cancel')} onClick={onCancel} disabled={saving}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── RagChip ───────────────────────────────────────────────────────────────────

function RagChip({ sources }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ textAlign: 'right' }}>
      <button style={s.ragChip} onClick={() => setOpen(!open)} title="Souvenirs contextuels injectés">
        🧠 {sources.length}
      </button>
      {open && (
        <div style={s.ragPanel}>
          {sources.map((src, i) => (
            <div key={i} style={s.ragEntry}>
              <div style={s.ragEntryMeta}>
                {src.wing} › {src.room} · {Math.round(src.score * 100)}%
              </div>
              <div style={s.ragEntryContent}>
                {src.content.length > 200 ? src.content.slice(0, 200) + '…' : src.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ToolCard ──────────────────────────────────────────────────────────────────

function ToolCard({ tool }) {
  const [open, setOpen] = useState(false);
  const { name, args, result, status } = tool;
  const isRunning = status === 'running';
  const isError = status === 'error';

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .tool-spin{display:inline-block;animation:spin 0.9s linear infinite}
        @keyframes pulse-ring{0%{transform:scale(1);opacity:0.8}70%{transform:scale(1.6);opacity:0}100%{transform:scale(1.6);opacity:0}}
        .mic-pulse::before{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid #ef4444;animation:pulse-ring 1.2s ease-out infinite}
      `}</style>
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

function Message({ msg, onUploadConfirm, onUploadCancel }) {
  return (
    <div className="msg-enter" style={s.msgWrapper(msg.role)}>
      <div style={{ maxWidth: '72%' }}>
        <div style={{ ...s.bubble(msg.role), maxWidth: 'none' }}>
          {msg.role === 'assistant' ? (
            <>
              {msg.content && (
                <div className="markdown-body">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
              {msg.uploadProposal && (
                <UploadProposal
                  proposal={msg.uploadProposal}
                  onConfirm={onUploadConfirm}
                  onCancel={onUploadCancel}
                />
              )}
            </>
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
              {msg.tools.map((t, i) => <ToolCard key={`${t.name}-${i}`} tool={t} />)}
            </div>
          )}
        </div>
        {msg.role === 'user' && msg.ragSources?.length > 0 && (
          <RagChip sources={msg.ragSources} />
        )}
      </div>
    </div>
  );
}

// ── SessionPanel ──────────────────────────────────────────────────────────────

const STORAGE_MODES = [
  { value: 'local', icon: '💾', title: 'Local' },
  { value: 'cloud', icon: '☁️', title: 'Cloud' },
  { value: 'mempalace', icon: '🧠', title: 'MemPalace' },
];

function SessionPanel({
  sessions, currentId, onSelect, onNew, onDelete,
  searchQuery, onSearchChange, searchResults, searchLoading,
  storageMode, onStorageModeChange,
}) {
  const listToShow = searchResults !== null ? searchResults : [...sessions].reverse();

  return (
    <div style={s.panelInner}>
      <div style={s.panelHeader}>
        <button style={s.newBtn} onClick={onNew}>
          <span>＋</span> Nouvelle conversation
        </button>
      </div>

      <div style={s.searchBox}>
        <span style={s.searchIcon}>{searchLoading ? '…' : '⌕'}</span>
        <input
          style={s.searchInput}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Rechercher…"
        />
      </div>

      <div style={s.sessionList}>
        {listToShow.map(session => (
          <div
            key={session.id}
            style={s.sessionItem(session.id === currentId)}
            onClick={() => session.id && onSelect(session.id)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.sessionTitle(session.id === currentId)}>
                {session.title}
              </div>
              {session.snippet ? (
                <div style={s.snippetText}>{session.snippet}</div>
              ) : (
                <div style={s.sessionDate}>{relativeDate(session.createdAt || session.updated_at)}</div>
              )}
            </div>
            {searchResults === null && (
              <button
                style={s.deleteBtn}
                onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                title="Supprimer"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {searchResults !== null && searchResults.length === 0 && (
          <div style={{ padding: '16px 10px', color: '#444', fontSize: '12px', textAlign: 'center' }}>
            Aucun résultat
          </div>
        )}
      </div>

      <div style={s.storageBar}>
        {STORAGE_MODES.map(m => (
          <button
            key={m.value}
            style={s.storageBtn(storageMode === m.value)}
            title={m.title}
            onClick={() => onStorageModeChange(m.value)}
          >
            {m.icon}
          </button>
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
  const [ragEnabled, setRagEnabled] = useState(
    () => localStorage.getItem('ws_rag_enabled') !== 'false'
  );
  const [summarizeEnabled, setSummarizeEnabled] = useState(
    () => localStorage.getItem('ws_summarize_enabled') !== 'false'
  );
  const [toast, setToast] = useState(null);
  const summarizingRef = useRef(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem('ws_selected_model') || ''
  );
  const [compareMode, setCompareMode] = useState(false);
  const [compareTriggerKey, setCompareTriggerKey] = useState(0);
  const [compareUserText, setCompareUserText] = useState('');

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(
    () => (loadVoiceSettings().ttsEnabled ?? DEFAULT_VOICE_SETTINGS.ttsEnabled)
  );
  const [micMode, setMicMode] = useState(
    () => (loadVoiceSettings().micMode ?? DEFAULT_VOICE_SETTINGS.micMode)
  );
  const sendMessageRef = useRef(null);

  const voiceManager = useMemo(() => {
    const settings = { ...DEFAULT_VOICE_SETTINGS, ...loadVoiceSettings() };
    const vm = new VoiceManager(settings);
    vm.onRecordingChange(setIsRecording);
    vm.onSpeakingChange(setIsSpeaking);
    vm.onInterim((text) => { setInput(text); });
    vm.onTranscript((text) => {
      setInput(text);
      setTimeout(() => textareaRef.current?.focus(), 50);
    });
    vm.onAutoSend((text) => {
      setInput('');
      sendMessageRef.current?.(text);
    });
    return vm;
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const [storageMode, setStorageMode] = useState(
    () => localStorage.getItem('ws_storage_mode') || 'local'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const cloudSyncRef = useRef(null);

  useEffect(() => {
    fetchAvailableModels().then(models => setAvailableModels(models));
  }, []);

  // Cloud sync — debounced 2s after session changes
  useEffect(() => {
    if (storageMode !== 'cloud' || !currentId || isStreaming) return;
    const session = sessions.find(s => s.id === currentId);
    if (!session || session.messages.length === 0) return;
    clearTimeout(cloudSyncRef.current);
    cloudSyncRef.current = setTimeout(() => {
      syncConversation(session).catch(() => {});
    }, 2000);
    return () => clearTimeout(cloudSyncRef.current);
  }, [sessions, storageMode, currentId, isStreaming]);

  // Search — debounced 300ms, mode-aware
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        if (storageMode === 'local') {
          const q = searchQuery.toLowerCase();
          const results = sessions
            .filter(s =>
              s.title.toLowerCase().includes(q) ||
              s.messages.some(m => (m.content || '').toLowerCase().includes(q))
            )
            .map(s => {
              const matchMsg = s.messages.find(m => (m.content || '').toLowerCase().includes(q));
              const content = matchMsg?.content || '';
              const idx = content.toLowerCase().indexOf(q);
              const start = Math.max(0, idx - 60);
              const end = Math.min(content.length, idx + q.length + 60);
              const snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
              return { id: s.id, title: s.title, snippet, createdAt: s.createdAt };
            });
          setSearchResults(results);
        } else if (storageMode === 'cloud') {
          const data = await searchConversations(searchQuery);
          setSearchResults((data.results || []).map(r => ({ ...r, createdAt: r.updated_at })));
        } else if (storageMode === 'mempalace') {
          const data = await mempalaceSearch(searchQuery, 'Input', 20);
          const results = (data?.results || [])
            .filter(r => r.metadata?.room === 'conversations')
            .map(r => ({
              id: r.metadata?.session_id || null,
              title: r.metadata?.title || 'Conversation',
              snippet: (r.content || '').slice(0, 120),
              createdAt: r.metadata?.added_at,
            }));
          setSearchResults(results);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, storageMode, sessions]);

  // Cleanup VoiceManager on unmount
  useEffect(() => {
    return () => {
      voiceManager.stopSpeaking();
      voiceManager.stopRecording();
    };
  }, [voiceManager]);

  // Sync voice settings (mode, TTS) when user saves in VoiceView
  useEffect(() => {
    const handler = () => {
      const saved = loadVoiceSettings();
      const newMode = saved.micMode ?? DEFAULT_VOICE_SETTINGS.micMode;
      setMicMode(newMode);
      const newTts = saved.ttsEnabled ?? DEFAULT_VOICE_SETTINGS.ttsEnabled;
      setTtsEnabled(newTts);
      voiceManager.updateSettings(saved);
    };
    window.addEventListener('ws-voice-settings-saved', handler);
    return () => window.removeEventListener('ws-voice-settings-saved', handler);
  }, [voiceManager]);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const assistantIdxRef = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = useCallback((msg, durationMs = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(null), durationMs);
  }, []);

  const triggerSummarize = useCallback(async (msgs) => {
    if (summarizingRef.current) return;
    const chatMsgs = (msgs || messages).filter(m => m.role === 'user' || m.role === 'assistant');
    if (chatMsgs.length < 2) return;
    summarizingRef.current = true;
    try {
      const { summary, stored } = await summarizeConversation(chatMsgs, currentId || '');
      if (summary) {
        showToast(stored ? '📝 Résumé sauvegardé dans MemPalace' : '📝 Résumé généré (MemPalace non connecté)');
      }
    } catch (e) {
      // silent — do not block the UI
    } finally {
      summarizingRef.current = false;
    }
  }, [messages, currentId, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [messages, isStreaming, currentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-summarize every SUMMARIZE_THRESHOLD messages
  useEffect(() => {
    if (!summarizeEnabled || isStreaming) return;
    const chatCount = messages.filter(m => m.role === 'user' || m.role === 'assistant').length;
    if (chatCount > 0 && chatCount % SUMMARIZE_THRESHOLD === 0) {
      triggerSummarize(messages);
    }
  }, [messages.length, isStreaming, summarizeEnabled, triggerSummarize]);

  function adjustTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function pushSessionToMempalace(session) {
    if (!session || session.messages.length < 2) return;
    const lines = [`# ${session.title}`, `Date: ${session.createdAt}`, ''];
    for (const msg of session.messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        lines.push(`**${msg.role === 'user' ? 'Vous' : 'Assistant'}:** ${msg.content || ''}`);
        lines.push('');
      }
    }
    addMempalaceDrawer(lines.join('\n'), 'Input', 'conversations', {
      session_id: session.id,
      title: session.title,
      message_count: String(session.messages.length),
    }).catch(() => {});
  }

  function handleNewSession() {
    if (storageMode === 'mempalace') {
      const current = sessions.find(s => s.id === currentId);
      if (current && current.messages.length > 0) pushSessionToMempalace(current);
    }
    const session = newSession();
    setSessions(prev => {
      const updated = [...prev, session];
      saveSessions(updated);
      return updated;
    });
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
    if (storageMode === 'cloud') {
      deleteConversationCloud(id).catch(() => {});
    }
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

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file || isStreaming || isUploading) return;
    e.target.value = '';
    const proposalId = crypto.randomUUID();
    setIsUploading(true);
    setMessages(prev => [
      ...prev,
      { role: 'user', content: `📎 **${file.name}**` },
      { role: 'assistant', content: '', uploadProposal: { _id: proposalId, status: 'loading', filename: file.name } },
    ]);
    try {
      const result = await uploadFile(file);
      setMessages(prev => prev.map(m =>
        m.uploadProposal?._id === proposalId
          ? { ...m, uploadProposal: { _id: proposalId, status: 'pending', ...result } }
          : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.uploadProposal?._id === proposalId
          ? { ...m, content: `Erreur lors de l'analyse : ${err.message}`, uploadProposal: undefined }
          : m
      ));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleUploadConfirm(proposalId, wing, room) {
    const msg = messages.find(m => m.uploadProposal?._id === proposalId);
    if (!msg) return;
    const { file_id, filename, summary } = msg.uploadProposal;
    await confirmDocument({ file_id, filename, wing, room, summary });
    setMessages(prev => prev.map(m =>
      m.uploadProposal?._id === proposalId
        ? { ...m, uploadProposal: { ...m.uploadProposal, status: 'confirmed', final_wing: wing, final_room: room } }
        : m
    ));
  }

  function handleUploadCancel(proposalId) {
    setMessages(prev => prev.map(m =>
      m.uploadProposal?._id === proposalId
        ? { ...m, uploadProposal: { ...m.uploadProposal, status: 'cancelled' } }
        : m
    ));
  }

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || isUploading) return;

    if (compareMode) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = '42px';
      setCompareUserText(trimmed);
      setCompareTriggerKey(k => k + 1);
      return;
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

    const userMsg = { role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '42px';
    setIsStreaming(true);

    const assistantIdx = newMessages.length;
    assistantIdxRef.current = assistantIdx;
    setMessages(prev => [...prev, { role: 'assistant', content: '', tools: [] }]);

    // Cap history sent to LLM to avoid token bloat on long conversations
    const contextMessages = newMessages.length > MAX_CONTEXT_MESSAGES
      ? newMessages.slice(newMessages.length - MAX_CONTEXT_MESSAGES)
      : newMessages;

    try {
      await streamChat(
        contextMessages,
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
        () => {
          setIsStreaming(false);
          // TTS: read out the final assistant response (markdown stripped)
          if (ttsEnabled) {
            setMessages(prev => {
              const lastMsg = prev[assistantIdxRef.current];
              if (lastMsg?.role === 'assistant' && lastMsg.content) {
                voiceManager.speak(stripMarkdownForTTS(lastMsg.content));
              }
              return prev;
            });
          }
        },
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
        // useRag
        ragEnabled,
        // onRagSources — attach injected memories to the user message
        (sources) => {
          setMessages(prev => {
            const updated = [...prev];
            const userIdx = assistantIdxRef.current - 1;
            if (userIdx >= 0) {
              updated[userIdx] = { ...updated[userIdx], ragSources: sources };
            }
            return updated;
          });
        },
        // model — null = default from server config
        selectedModel || null,
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

  function handleUseResponse(userText, content) {
    setMessages(prev => [
      ...prev,
      { role: 'user', content: userText },
      { role: 'assistant', content, tools: [] },
    ]);
    setCompareUserText('');
  }

  // Keep the ref up-to-date every render so onAutoSend always calls the latest version
  sendMessageRef.current = sendMessage;

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const isPTT = micMode === 'push_to_talk';
  const micLabel = isPTT
    ? (isRecording ? 'Relâcher pour envoyer' : 'Maintenir pour parler')
    : (isRecording ? 'Cliquer pour arrêter' : 'Démarrer le dialogue ouvert');

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

      {toast && <div style={s.toast}>{toast}</div>}

      {/* Chat area */}
      <div style={s.chat}>
        <div style={s.header}>
          <button style={s.toggleBtn} onClick={() => setShowPanel(!showPanel)} title="Sessions">
            ☰
          </button>
          <span style={s.sessionTitleDisplay}>
            {currentSession?.title || 'Conversation'}
          </span>
          <Tooltip label={compareMode ? 'Désactiver la comparaison' : 'Comparer des modèles côte-à-côte'} position="bottom">
            <button
              style={{
                marginLeft: 'auto',
                background: compareMode ? '#7c3aed22' : 'none',
                border: `1px solid ${compareMode ? '#7c3aed66' : '#2a2a2a'}`,
                borderRadius: '6px',
                color: compareMode ? '#a78bfa' : '#6b6b6b',
                cursor: 'pointer',
                padding: '4px 10px',
                fontSize: '13px',
                lineHeight: 1,
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
              onClick={() => {
                setCompareMode(m => !m);
                setCompareUserText('');
                setCompareTriggerKey(0);
              }}
            >
              ⚖
            </button>
          </Tooltip>
        </div>

        {compareMode ? (
          <ComparePanel
            messages={messages}
            availableModels={availableModels}
            triggerKey={compareTriggerKey}
            userText={compareUserText}
            onUseResponse={handleUseResponse}
          />
        ) : isEmpty ? (
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
            {messages.map((msg, i) => (
              <Message
                key={i}
                msg={msg}
                onUploadConfirm={msg.uploadProposal?.status === 'pending'
                  ? (wing, room) => handleUploadConfirm(msg.uploadProposal._id, wing, room)
                  : undefined}
                onUploadCancel={msg.uploadProposal?.status === 'pending'
                  ? () => handleUploadCancel(msg.uploadProposal._id)
                  : undefined}
              />
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

        {!compareMode && availableModels.length > 0 && (
          <div style={{ padding: '4px 20px 0', background: '#0f0f0f', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#555', flexShrink: 0 }}>Modèle</span>
            <select
              value={selectedModel}
              onChange={e => {
                setSelectedModel(e.target.value);
                localStorage.setItem('ws_selected_model', e.target.value);
              }}
              style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: '6px',
                color: selectedModel ? '#a78bfa' : '#555',
                fontSize: '11px',
                padding: '3px 6px',
                cursor: 'pointer',
                maxWidth: '280px',
                flex: 1,
              }}
            >
              <option value="">Défaut ({'{'}config serveur{'}'}</option>
              {availableModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}

        <div style={s.inputArea}>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.ogg,.webm,.txt,.md,.csv,.html"
            onChange={handleFileSelect}
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
            ref={textareaRef}
            style={s.textarea}
            value={input}
            onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder={
              isSpeaking ? '🔊 Réponse en cours…' :
              isRecording && isPTT ? '🎙️ Parlez… (relâchez pour envoyer)' :
              isRecording ? '🎙️ Écoute… (phrase détectée → envoi auto)' :
              compareMode ? '⚖ Comparer ce message sur tous les modèles…' :
              'Envoyer un message… (Shift+Entrée pour nouvelle ligne)'
            }
            disabled={isStreaming}
            rows={1}
          />

          {/* Mic button — PTT = hold to talk, open_dialogue = click toggle */}
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

          <Tooltip label={ttsEnabled ? 'Lecture vocale activée' : 'Lecture vocale désactivée'} position="top">
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
                  triggerSummarize();
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
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming || isUploading}
            >
              ↑
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
