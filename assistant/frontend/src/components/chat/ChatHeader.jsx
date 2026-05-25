import Tooltip from '../Tooltip.jsx';
import { s } from './styles.js';

// Header chat : toggle sidebar + titre session + personnalité active + bouton Compare.
export default function ChatHeader({
  showPanel, setShowPanel,
  currentTitle,
  compareMode, onToggleCompare,
  activePersonality,
}) {
  return (
    <div style={s.header}>
      <button style={s.toggleBtn} onClick={() => setShowPanel(!showPanel)} title="Sessions">☰</button>
      <span style={s.sessionTitleDisplay}>{currentTitle || 'Conversation'}</span>

      {activePersonality && activePersonality.key !== 'default' && (
        <Tooltip label={`Mode : ${activePersonality.label} — ${activePersonality.description}`} position="bottom">
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: '#3b076422',
            border: '1px solid #7c3aed44',
            borderRadius: '20px',
            padding: '3px 10px',
            fontSize: '12px',
            color: '#c4b5fd',
            cursor: 'default',
            flexShrink: 0,
          }}>
            {activePersonality.emoji} {activePersonality.label}
          </span>
        </Tooltip>
      )}

      <Tooltip label={compareMode ? 'Désactiver la comparaison' : 'Comparer des modèles côte-à-côte'} position="bottom">
        <button
          style={{
            marginLeft: activePersonality && activePersonality.key !== 'default' ? '8px' : 'auto',
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
          onClick={onToggleCompare}
        >
          ⚖
        </button>
      </Tooltip>
    </div>
  );
}

// Sélecteur de modèle (sous la zone messages, avant l'input).
export function ModelSelector({ availableModels, selectedModel, onSelectModel }) {
  if (!availableModels.length) return null;
  return (
    <div style={{ padding: '4px 20px 0', background: '#0f0f0f', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '11px', color: '#555', flexShrink: 0 }}>Modèle</span>
      <select
        value={selectedModel}
        onChange={e => onSelectModel(e.target.value)}
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
        {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}
