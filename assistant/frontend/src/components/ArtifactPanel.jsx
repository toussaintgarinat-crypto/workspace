import { useState } from 'react';

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: '16px',
  },
  panel: {
    width: '520px',
    maxWidth: '90vw',
    height: 'calc(100vh - 32px)',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    borderBottom: '1px solid #1e1e1e',
    flexShrink: 0,
  },
  title: { flex: 1, fontSize: '13px', fontWeight: 600, color: '#e0e0e0' },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#6b6b6b',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: 1,
    padding: '2px 6px',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #1e1e1e',
    flexShrink: 0,
  },
  tab: (active) => ({
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? '#7c3aed' : 'transparent'}`,
    color: active ? '#a78bfa' : '#6b6b6b',
    marginBottom: '-1px',
  }),
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  codeBlock: {
    background: '#0d0d0d',
    borderRadius: '8px',
    padding: '14px',
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: '1.6',
    color: '#e0e0e0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: '0 0 16px',
    border: '1px solid #1e1e1e',
    position: 'relative',
  },
  langLabel: {
    fontSize: '11px',
    color: '#555',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
    padding: '10px 16px',
    borderTop: '1px solid #1e1e1e',
  },
  actionBtn: (variant) => ({
    padding: '7px 16px',
    border: 'none',
    borderRadius: '7px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    background: variant === 'primary' ? '#7c3aed22' : '#27272a',
    color: variant === 'primary' ? '#a78bfa' : '#9ca3af',
  }),
  copied: { color: '#6ee7b7', fontSize: '12px', marginLeft: 'auto', alignSelf: 'center' },
};

function parseCodeBlocks(text) {
  const blocks = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ lang: match[1] || 'text', code: match[2].trim() });
  }
  return blocks;
}

export default function ArtifactPanel({ content, onClose }) {
  const [activeTab, setActiveTab] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const blocks = parseCodeBlocks(content);

  if (blocks.length === 0) {
    onClose();
    return null;
  }

  const handleCopy = (code, idx) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const handleDownload = (code, lang, idx) => {
    const ext = lang === 'javascript' || lang === 'js' ? 'js'
      : lang === 'typescript' || lang === 'ts' ? 'ts'
      : lang === 'python' || lang === 'py' ? 'py'
      : lang === 'html' ? 'html'
      : lang === 'css' ? 'css'
      : lang === 'json' ? 'json'
      : lang === 'bash' || lang === 'sh' ? 'sh'
      : lang === 'sql' ? 'sql'
      : 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artifact-${idx + 1}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const active = blocks[activeTab] || blocks[0];

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.panel}>
        <div style={s.header}>
          <span style={s.title}>Canvas — {blocks.length} bloc{blocks.length > 1 ? 's' : ''}</span>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        {blocks.length > 1 && (
          <div style={s.tabs}>
            {blocks.map((b, i) => (
              <button key={i} style={s.tab(i === activeTab)} onClick={() => setActiveTab(i)}>
                {b.lang || 'text'} #{i + 1}
              </button>
            ))}
          </div>
        )}

        <div style={s.content}>
          {active && (
            <>
              {active.lang && <div style={s.langLabel}>{active.lang}</div>}
              <pre style={s.codeBlock}>{active.code}</pre>
            </>
          )}
        </div>

        <div style={s.actions}>
          <button style={s.actionBtn('primary')} onClick={() => handleCopy(active.code, activeTab)}>
            Copier
          </button>
          <button style={s.actionBtn()} onClick={() => handleDownload(active.code, active.lang, activeTab)}>
            Télécharger
          </button>
          {copiedIdx === activeTab && <span style={s.copied}>Copié ✓</span>}
        </div>
      </div>
    </div>
  );
}
