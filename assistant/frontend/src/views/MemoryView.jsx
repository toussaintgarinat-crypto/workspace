import { useState, useEffect, useCallback, useRef } from 'react';
import { mempalaceWings, mempalaceEntries, mempalaceSearch } from '../services/api.js';

const IPCRA = [
  { key: 'Input',     icon: '📥', color: '#3b82f6', bg: '#1d3a5c' },
  { key: 'Projet',    icon: '🚀', color: '#7c3aed', bg: '#2d1f4e' },
  { key: 'Casquette', icon: '🎩', color: '#f59e0b', bg: '#4a3310' },
  { key: 'Ressource', icon: '📚', color: '#10b981', bg: '#0f3326' },
  { key: 'Archive',   icon: '🗄️', color: '#6b7280', bg: '#1f2937' },
];

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0f0f0f',
    color: '#e5e5e5',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid #2a2a2a',
    flexShrink: 0,
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#f0f0f0',
    margin: '0 0 12px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  searchRow: {
    display: 'flex',
    gap: '8px',
  },
  searchInput: {
    flex: 1,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    padding: '8px 12px',
    color: '#e5e5e5',
    fontSize: '13px',
    outline: 'none',
  },
  searchBtn: {
    background: '#7c3aed',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 14px',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  wingsPanel: {
    width: '180px',
    borderRight: '1px solid #2a2a2a',
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flexShrink: 0,
    overflowY: 'auto',
  },
  wingBtn: (active, color, bg) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: 'none',
    background: active ? bg : 'transparent',
    color: active ? color : '#9a9a9a',
    cursor: 'pointer',
    fontSize: '13px',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.1s, color 0.1s',
  }),
  wingCount: (color) => ({
    marginLeft: 'auto',
    fontSize: '11px',
    background: `${color}22`,
    color: color,
    borderRadius: '10px',
    padding: '1px 6px',
    flexShrink: 0,
  }),
  content: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  entriesList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  entryCard: (selected) => ({
    background: selected ? '#1e1e2e' : '#161616',
    border: `1px solid ${selected ? '#7c3aed44' : '#2a2a2a'}`,
    borderRadius: '10px',
    padding: '12px 14px',
    cursor: 'pointer',
    transition: 'background 0.1s, border-color 0.1s',
  }),
  entryContent: {
    fontSize: '13px',
    color: '#d0d0d0',
    lineHeight: '1.5',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  entryMeta: {
    fontSize: '11px',
    color: '#555',
    marginTop: '6px',
    display: 'flex',
    gap: '8px',
  },
  score: (s) => ({
    fontSize: '11px',
    color: s > 0.7 ? '#10b981' : s > 0.4 ? '#f59e0b' : '#6b7280',
    background: s > 0.7 ? '#0f332622' : s > 0.4 ? '#4a331022' : '#1f293722',
    borderRadius: '8px',
    padding: '1px 6px',
  }),
  detail: {
    borderTop: '1px solid #2a2a2a',
    padding: '16px',
    maxHeight: '240px',
    overflowY: 'auto',
    background: '#111',
    flexShrink: 0,
  },
  detailContent: {
    fontSize: '13px',
    color: '#d0d0d0',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
  },
  detailClose: {
    float: 'right',
    background: 'none',
    border: 'none',
    color: '#555',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#444',
    fontSize: '13px',
    flexDirection: 'column',
    gap: '8px',
  },
  disconnected: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: '12px',
    color: '#666',
  },
  connectHint: {
    fontSize: '12px',
    color: '#555',
    background: '#1a1a1a',
    borderRadius: '8px',
    padding: '8px 14px',
  },
  loadingDot: {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#555',
    animation: 'pulse 1.2s infinite',
  },
};

export default function MemoryView() {
  const [connected, setConnected] = useState(null); // null=loading, true, false
  const [wings, setWings] = useState([]);
  const [activeWing, setActiveWing] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);

  // Build wings list merging IPCRA template + real counts
  const buildWingsList = (raw) => {
    const countMap = {};
    for (const w of raw) countMap[w.wing] = w.count;
    return IPCRA.map(def => ({
      ...def,
      count: countMap[def.key] || 0,
    }));
  };

  useEffect(() => {
    mempalaceWings()
      .then(data => {
        if (data === null) {
          setConnected(false);
        } else {
          setConnected(true);
          setWings(buildWingsList(data));
        }
      })
      .catch(() => setConnected(false));
  }, []);

  const loadEntries = useCallback(async (wing) => {
    setLoadingEntries(true);
    setSelected(null);
    setSearchResults(null);
    setSearchQuery('');
    try {
      const data = await mempalaceEntries(wing);
      setEntries(data || []);
    } catch {
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  const handleWingClick = (wing) => {
    setActiveWing(wing);
    loadEntries(wing);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSelected(null);
    try {
      const data = await mempalaceSearch(searchQuery.trim(), activeWing, 15);
      setSearchResults(data?.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') {
      setSearchQuery('');
      setSearchResults(null);
    }
  };

  const displayItems = searchResults !== null
    ? searchResults.map(r => ({ ...r, isSearch: true }))
    : entries.map(e => ({ content: e.content, metadata: e.metadata, id: e.id }));

  if (connected === null) {
    return (
      <div style={s.root}>
        <div style={s.disconnected}>
          <span style={{ fontSize: '24px' }}>🧠</span>
          <span style={{ color: '#555', fontSize: '13px' }}>Chargement…</span>
        </div>
      </div>
    );
  }

  if (connected === false) {
    return (
      <div style={s.root}>
        <div style={s.disconnected}>
          <span style={{ fontSize: '32px' }}>🧠</span>
          <span style={{ fontSize: '14px', color: '#888' }}>MemPalace non connecté</span>
          <span style={s.connectHint}>
            Configurez la connexion dans <strong>🔗 Connexions</strong>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <p style={s.title}>
          <span>🧠</span> Mémoire
        </p>
        <div style={s.searchRow}>
          <input
            ref={inputRef}
            style={s.searchInput}
            placeholder={activeWing ? `Rechercher dans ${activeWing}…` : 'Recherche sémantique…'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button style={s.searchBtn} onClick={handleSearch} disabled={searching}>
            {searching ? '…' : '🔍'}
          </button>
        </div>
      </div>

      <div style={s.body}>
        <div style={s.wingsPanel}>
          {wings.map(w => (
            <button
              key={w.key}
              style={s.wingBtn(activeWing === w.key, w.color, w.bg)}
              onClick={() => handleWingClick(w.key)}
            >
              <span>{w.icon}</span>
              <span style={{ flex: 1, fontSize: '12px' }}>{w.key}</span>
              {w.count > 0 && (
                <span style={s.wingCount(w.color)}>{w.count}</span>
              )}
            </button>
          ))}
        </div>

        <div style={s.content}>
          {!activeWing && searchResults === null ? (
            <div style={s.empty}>
              <span style={{ fontSize: '24px' }}>←</span>
              <span>Sélectionnez une wing</span>
            </div>
          ) : loadingEntries ? (
            <div style={s.empty}>
              <span>Chargement…</span>
            </div>
          ) : (
            <>
              <div style={s.entriesList}>
                {searchResults !== null && (
                  <div style={{ fontSize: '11px', color: '#555', paddingBottom: '4px' }}>
                    {searchResults.length} résultat{searchResults.length !== 1 ? 's' : ''} pour «{searchQuery}»
                    <button
                      onClick={() => { setSearchResults(null); setSearchQuery(''); }}
                      style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: '11px' }}
                    >
                      ✕ effacer
                    </button>
                  </div>
                )}
                {displayItems.length === 0 ? (
                  <div style={{ ...s.empty, paddingTop: '40px' }}>
                    <span style={{ fontSize: '20px' }}>🕳️</span>
                    <span>{searchResults !== null ? 'Aucun résultat' : 'Wing vide'}</span>
                  </div>
                ) : (
                  displayItems.map((item, i) => (
                    <div
                      key={item.id || i}
                      style={s.entryCard(selected === i)}
                      onClick={() => setSelected(selected === i ? null : i)}
                    >
                      <div style={s.entryContent}>{item.content}</div>
                      <div style={s.entryMeta}>
                        {item.metadata?.room && (
                          <span>📁 {item.metadata.room}</span>
                        )}
                        {item.metadata?.added_at && (
                          <span>{item.metadata.added_at.slice(0, 10)}</span>
                        )}
                        {item.isSearch && item.score !== undefined && (
                          <span style={s.score(item.score)}>
                            {Math.round(item.score * 100)}%
                          </span>
                        )}
                        {item.metadata?.wing && item.isSearch && (
                          <span style={{ color: '#7c3aed', fontSize: '11px' }}>
                            {item.metadata.wing}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selected !== null && displayItems[selected] && (
                <div style={s.detail}>
                  <button style={s.detailClose} onClick={() => setSelected(null)}>✕</button>
                  <div style={{ fontSize: '11px', color: '#555', marginBottom: '8px' }}>
                    {displayItems[selected].metadata?.wing} › {displayItems[selected].metadata?.room || 'general'}
                  </div>
                  <div style={s.detailContent}>{displayItems[selected].content}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
