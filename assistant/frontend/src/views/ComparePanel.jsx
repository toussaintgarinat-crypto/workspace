import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamChat } from '../services/api.js';

const MAX_MODELS = 4;

const s = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modelSelector: {
    padding: '10px 16px',
    borderBottom: '1px solid #1e1e1e',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
    flexShrink: 0,
    background: '#0f0f0f',
  },
  selectorLabel: {
    fontSize: '11px',
    color: '#555',
    flexShrink: 0,
    marginRight: '2px',
  },
  modelChip: (selected, disabled) => ({
    padding: '3px 10px',
    borderRadius: '20px',
    border: `1px solid ${selected ? '#7c3aed66' : '#2a2a2a'}`,
    background: selected ? '#7c3aed22' : '#1a1a1a',
    color: selected ? '#c4b5fd' : '#666',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '11px',
    transition: 'all 0.15s',
    userSelect: 'none',
    opacity: disabled && !selected ? 0.5 : 1,
    fontFamily: 'monospace',
  }),
  count: {
    fontSize: '11px',
    color: '#3a3a3a',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  columns: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    gap: '1px',
    background: '#1e1e1e',
  },
  column: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#0f0f0f',
    overflow: 'hidden',
    minWidth: 0,
  },
  colHeader: {
    padding: '7px 12px',
    borderBottom: '1px solid #1e1e1e',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    background: '#141414',
  },
  colModel: {
    fontSize: '11px',
    color: '#a78bfa',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  colBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 16px',
    fontSize: '13px',
    color: '#e0e0e0',
    lineHeight: '1.65',
  },
  useBtn: {
    padding: '3px 10px',
    background: '#7c3aed',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#a78bfa',
    flexShrink: 0,
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '12px',
    padding: '14px 16px',
  },
  hint: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    color: '#333',
    fontSize: '13px',
  },
  hintIcon: {
    fontSize: '28px',
    opacity: 0.4,
  },
};

export default function ComparePanel({ messages, availableModels, triggerKey, userText, onUseResponse }) {
  const [selectedModels, setSelectedModels] = useState([]);
  const [streams, setStreams] = useState({});
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (!triggerKey || !userText) return;
    if (selectedModels.length < 2) return;
    startCompare(selectedModels, userText, messages);
  }, [triggerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleModel(model) {
    if (comparing) return;
    setSelectedModels(prev => {
      if (prev.includes(model)) return prev.filter(m => m !== model);
      if (prev.length >= MAX_MODELS) return prev;
      return [...prev, model];
    });
  }

  async function startCompare(models, text, ctx) {
    setComparing(true);
    const contextMessages = [...ctx, { role: 'user', content: text }];

    const init = {};
    for (const m of models) init[m] = { content: '', done: false, error: null };
    setStreams(init);

    await Promise.allSettled(
      models.map(model =>
        streamChat(
          contextMessages,
          (chunk) => setStreams(prev => {
            const cur = prev[model] || { content: '', done: false, error: null };
            return { ...prev, [model]: { ...cur, content: cur.content + chunk } };
          }),
          () => {},
          () => {},
          () => setStreams(prev => ({
            ...prev,
            [model]: { ...(prev[model] || {}), done: true },
          })),
          false,
          null,
          false,
          null,
          model,
        ).catch(err => {
          setStreams(prev => ({
            ...prev,
            [model]: { ...(prev[model] || {}), done: true, error: err.message },
          }));
        })
      )
    );

    setComparing(false);
  }

  const hasStreams = Object.keys(streams).length > 0;

  return (
    <div style={s.root}>
      <div style={s.modelSelector}>
        <span style={s.selectorLabel}>Modèles</span>
        {availableModels.length === 0 && (
          <span style={{ fontSize: '11px', color: '#3a3a3a' }}>Chargement…</span>
        )}
        {availableModels.map(model => {
          const selected = selectedModels.includes(model);
          const maxed = !selected && selectedModels.length >= MAX_MODELS;
          return (
            <button
              key={model}
              style={s.modelChip(selected, comparing || maxed)}
              onClick={() => toggleModel(model)}
              title={maxed ? 'Maximum 4 modèles' : model}
            >
              {model}
            </button>
          );
        })}
        {selectedModels.length > 0 && (
          <span style={s.count}>{selectedModels.length}/{MAX_MODELS}</span>
        )}
      </div>

      {!hasStreams ? (
        <div style={s.hint}>
          <span style={s.hintIcon}>⚖</span>
          <span>
            {selectedModels.length < 2
              ? 'Sélectionnez au moins 2 modèles ci-dessus'
              : 'Envoyez un message pour lancer la comparaison'}
          </span>
        </div>
      ) : (
        <div style={s.columns}>
          {Object.entries(streams).map(([model, state]) => (
            <div key={model} style={s.column}>
              <div style={s.colHeader}>
                <span style={s.colModel} title={model}>{model}</span>
                {!state.done && <span style={s.dot} />}
                {state.done && state.error && (
                  <span style={{ fontSize: '10px', color: '#ef4444' }}>Erreur</span>
                )}
                {state.done && !state.error && (
                  <button
                    style={s.useBtn}
                    onClick={() => onUseResponse(userText, state.content)}
                  >
                    Utiliser
                  </button>
                )}
              </div>
              {state.error ? (
                <div style={s.errorText}>{state.error}</div>
              ) : (
                <div style={s.colBody}>
                  <ReactMarkdown>{state.content || ' '}</ReactMarkdown>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
