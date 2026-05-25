import { useState, useEffect, useCallback, useRef } from 'react';
import { mempalaceWings, mempalaceEntries, mempalaceSearch, mempalaceExport, mempalaceImport, mempalaceExportFull, mempalaceImportFull } from '../services/api.js';

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
  exportBtn: {
    background: 'none',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    padding: '4px 10px',
    color: '#888',
    fontSize: '12px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  importBtn: {
    background: 'none',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    padding: '4px 10px',
    color: '#888',
    fontSize: '12px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  degradedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#f59e0b',
    background: '#4a331022',
    border: '1px solid #4a3310',
    borderRadius: '8px',
    padding: '2px 8px',
    flexShrink: 0,
  },
  modal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modalBox: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '24px',
    width: '400px',
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  modalTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#f0f0f0',
    margin: 0,
  },
  modalSub: {
    fontSize: '12px',
    color: '#666',
    margin: 0,
  },
  modalActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '4px',
  },
  modalCancel: {
    background: 'none',
    border: '1px solid #333',
    borderRadius: '6px',
    padding: '6px 14px',
    color: '#888',
    cursor: 'pointer',
    fontSize: '13px',
  },
  modalConfirm: {
    background: '#7c3aed',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 14px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
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
  const [degradedSearch, setDegradedSearch] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // {entries, filename}
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importFullModal, setImportFullModal] = useState(false);
  const [importFullFile, setImportFullFile] = useState(null);
  const [importingFull, setImportingFull] = useState(false);
  const [importFullResult, setImportFullResult] = useState(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const fileFullRef = useRef(null);

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
      setDegradedSearch(data?.degraded || false);
    } catch {
      setSearchResults([]);
      setDegradedSearch(false);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') {
      setSearchQuery('');
      setSearchResults(null);
      setDegradedSearch(false);
    }
  };

  const handleExport = async (format) => {
    setExporting(true);
    try { await mempalaceExport(format); } catch { /* ignore */ }
    setExporting(false);
  };

  const handleExportFull = async () => {
    setExportingFull(true);
    try { await mempalaceExportFull(); } catch { /* ignore */ }
    setExportingFull(false);
  };

  const handleImportFullConfirm = async () => {
    if (!importFullFile) return;
    setImportingFull(true);
    try {
      const res = await mempalaceImportFull(importFullFile);
      setImportFullResult(res);
      const data = await mempalaceWings();
      if (data) setWings(buildWingsList(data));
    } catch (err) {
      setImportFullResult({ error: err.message });
    }
    setImportingFull(false);
  };

  const closeImportFull = () => {
    setImportFullModal(false);
    setImportFullFile(null);
    setImportFullResult(null);
    if (fileFullRef.current) fileFullRef.current.value = '';
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const arr = Array.isArray(parsed) ? parsed : parsed.entries || [];
        setImportPreview({ entries: arr, filename: file.name });
        setImportResult(null);
      } catch {
        setImportPreview({ entries: null, filename: file.name });
      }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    if (!importPreview?.entries?.length) return;
    setImporting(true);
    try {
      const res = await mempalaceImport(importPreview.entries);
      setImportResult(res);
      // Refresh wing counts
      const data = await mempalaceWings();
      if (data) setWings(buildWingsList(data));
    } catch (err) {
      setImportResult({ error: err.message });
    }
    setImporting(false);
  };

  const closeImport = () => {
    setImportModal(false);
    setImportPreview(null);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = '';
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
        <p style={{ ...s.title, justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧠</span> Mémoire
            {degradedSearch && (
              <span style={s.degradedBadge} title="Qdrant indisponible — recherche par mots-clés">
                🔍 Recherche dégradée
              </span>
            )}
          </span>
          <span style={{ display: 'flex', gap: '6px' }}>
            <button
              style={s.importBtn}
              onClick={() => setImportModal(true)}
              title="Importer des mémoires (JSON)"
            >
              📥 Import
            </button>
            <button
              style={s.importBtn}
              onClick={() => setImportFullModal(true)}
              title="Importer une sauvegarde complète (ZIP)"
            >
              📦 Import ZIP
            </button>
            <button
              style={s.exportBtn}
              onClick={() => handleExport('json')}
              disabled={exporting}
              title="Exporter en JSON"
            >
              {exporting ? '…' : '📤 Export'}
            </button>
            <button
              style={s.exportBtn}
              onClick={handleExportFull}
              disabled={exportingFull}
              title="Exporter sauvegarde complète (drawers + fichiers)"
            >
              {exportingFull ? '…' : '📦 ZIP'}
            </button>
          </span>
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

      {importModal && (
        <div style={s.modal} onClick={closeImport}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <p style={s.modalTitle}>📥 Importer des mémoires</p>
            <p style={s.modalSub}>
              Sélectionnez un fichier JSON exporté depuis MemPalace.<br />
              Les entrées en double (même contenu) seront ignorées.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              style={{ fontSize: '13px', color: '#aaa' }}
              onChange={handleFileChange}
            />
            {importPreview && !importResult && (
              <p style={{ fontSize: '13px', color: importPreview.entries ? '#10b981' : '#ef4444', margin: 0 }}>
                {importPreview.entries
                  ? `${importPreview.entries.length} entrée${importPreview.entries.length !== 1 ? 's' : ''} détectée${importPreview.entries.length !== 1 ? 's' : ''} dans ${importPreview.filename}`
                  : `Fichier invalide : ${importPreview.filename}`}
              </p>
            )}
            {importResult && (
              <p style={{ fontSize: '13px', color: importResult.error ? '#ef4444' : '#10b981', margin: 0 }}>
                {importResult.error
                  ? `Erreur : ${importResult.error}`
                  : `✅ ${importResult.added} ajoutée${importResult.added !== 1 ? 's' : ''}, ${importResult.skipped} ignorée${importResult.skipped !== 1 ? 's' : ''}`}
              </p>
            )}
            <div style={s.modalActions}>
              <button style={s.modalCancel} onClick={closeImport}>Fermer</button>
              {!importResult && (
                <button
                  style={{ ...s.modalConfirm, opacity: importPreview?.entries?.length ? 1 : 0.4 }}
                  disabled={!importPreview?.entries?.length || importing}
                  onClick={handleImportConfirm}
                >
                  {importing ? 'Import…' : 'Importer'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {importFullModal && (
        <div style={s.modal} onClick={closeImportFull}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <p style={s.modalTitle}>📦 Import ZIP complet</p>
            <p style={s.modalSub}>
              Sélectionnez un fichier <code>.zip</code> exporté via "Export ZIP".<br />
              Drawers et fichiers originaux seront restaurés. Les doublons sont ignorés.
            </p>
            <input
              ref={fileFullRef}
              type="file"
              accept=".zip"
              style={{ fontSize: '13px', color: '#aaa' }}
              onChange={e => {
                setImportFullFile(e.target.files?.[0] || null);
                setImportFullResult(null);
              }}
            />
            {importFullFile && !importFullResult && (
              <p style={{ fontSize: '13px', color: '#10b981', margin: 0 }}>
                {importFullFile.name} — {(importFullFile.size / 1024 / 1024).toFixed(1)} Mo
              </p>
            )}
            {importFullResult && (
              <p style={{ fontSize: '13px', color: importFullResult.error ? '#ef4444' : '#10b981', margin: 0 }}>
                {importFullResult.error
                  ? `Erreur : ${importFullResult.error}`
                  : `✅ Drawers : +${importFullResult.drawers?.added} / ignorés ${importFullResult.drawers?.skipped} — Fichiers : +${importFullResult.documents?.added} / ignorés ${importFullResult.documents?.skipped}${importFullResult.documents?.errors ? ` / erreurs ${importFullResult.documents.errors}` : ''}`}
              </p>
            )}
            <div style={s.modalActions}>
              <button style={s.modalCancel} onClick={closeImportFull}>Fermer</button>
              {!importFullResult && (
                <button
                  style={{ ...s.modalConfirm, opacity: importFullFile ? 1 : 0.4 }}
                  disabled={!importFullFile || importingFull}
                  onClick={handleImportFullConfirm}
                >
                  {importingFull ? 'Import…' : 'Importer'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                      onClick={() => { setSearchResults(null); setSearchQuery(''); setDegradedSearch(false); }}
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
