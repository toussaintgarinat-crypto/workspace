import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { s, IPCRA_WINGS, formatSize } from './styles.js';

function hasCodeBlock(content) {
  return /```[\s\S]*?```/.test(content || '');
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

// ── MessageBubble ─────────────────────────────────────────────────────────────

export default function MessageBubble({ msg, onUploadConfirm, onUploadCancel, onOpenArtifact }) {
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
              {msg.content && hasCodeBlock(msg.content) && (
                <button
                  style={{
                    marginTop: '8px',
                    background: '#7c3aed22',
                    border: '1px solid #7c3aed44',
                    borderRadius: '6px',
                    color: '#a78bfa',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                  onClick={() => onOpenArtifact(msg.content)}
                >
                  ◻ Ouvrir le canvas
                </button>
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
