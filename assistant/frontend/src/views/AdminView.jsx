import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../services/api.js';
import { getToken, refreshIfNeeded } from '../services/keycloak.js';

const API = import.meta.env.VITE_API_URL || '/api';

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0f0f0f',
    color: '#e0e0e0',
    fontFamily: 'monospace',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #2a2a2a',
    flexShrink: 0,
  },
  title: { fontSize: '15px', fontWeight: 600, color: '#e0e0e0', margin: 0 },
  refreshBtn: {
    padding: '6px 14px',
    background: '#1e1e1e',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    color: '#a0a0a0',
    cursor: 'pointer',
    fontSize: '12px',
  },
  body: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' },
  warning: {
    padding: '10px 14px',
    background: '#2a1a00',
    border: '1px solid #7c5000',
    borderRadius: '8px',
    color: '#ffb347',
    fontSize: '12px',
  },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
    padding: '16px',
  },
  cardTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#6b6b6b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '12px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '10px',
  },
  stat: {
    background: '#111',
    borderRadius: '8px',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statLabel: { fontSize: '10px', color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.06em' },
  statValue: { fontSize: '18px', fontWeight: 700, color: '#e0e0e0' },
  statSub: { fontSize: '11px', color: '#888' },
  badge: (ok) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 600,
    background: ok ? '#0f3a1f' : '#2a1a2a',
    color: ok ? '#4ade80' : '#c084fc',
    border: `1px solid ${ok ? '#166534' : '#7c3aed'}`,
  }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', color: '#6b6b6b', fontWeight: 600, paddingBottom: '6px', borderBottom: '1px solid #2a2a2a', paddingRight: '16px' },
  td: { padding: '6px 0', paddingRight: '16px', color: '#c0c0c0', borderBottom: '1px solid #1e1e1e' },
  empty: { color: '#4a4a4a', fontSize: '12px', fontStyle: 'italic' },
  errorBanner: {
    padding: '10px 14px',
    background: '#1a0a0a',
    border: '1px solid #7c2020',
    borderRadius: '8px',
    color: '#f87171',
    fontSize: '12px',
  },
  spinner: { color: '#6b6b6b', fontSize: '13px', padding: '40px', textAlign: 'center' },
  progressBar: {
    height: '6px',
    borderRadius: '3px',
    background: '#2a2a2a',
    overflow: 'hidden',
    marginTop: '10px',
  },
  progressFill: (pct, status) => ({
    height: '100%',
    width: `${pct}%`,
    background: status === 'error' ? '#ef4444' : status === 'done' ? '#4ade80' : '#6366f1',
    transition: 'width 0.3s ease',
    borderRadius: '3px',
  }),
  updateBtn: (disabled) => ({
    padding: '7px 16px',
    background: disabled ? '#1e1e1e' : '#4f46e5',
    border: `1px solid ${disabled ? '#3a3a3a' : '#6366f1'}`,
    borderRadius: '6px',
    color: disabled ? '#555' : '#e0e0e0',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  }),
  tagInput: {
    padding: '6px 10px',
    background: '#111',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    color: '#e0e0e0',
    fontSize: '12px',
    width: '120px',
  },
  diskBar: (pct) => ({
    height: '8px',
    borderRadius: '4px',
    background: '#2a2a2a',
    overflow: 'hidden',
    marginTop: '6px',
    position: 'relative',
  }),
  diskFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#4ade80',
    borderRadius: '4px',
    transition: 'width 0.4s ease',
  }),
};

function fmtBytes(kb) {
  if (!kb) return '—';
  const gb = kb / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} Go`;
  const mb = kb / 1024;
  return `${mb.toFixed(0)} Mo`;
}

export default function AdminView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const [targetTag, setTargetTag] = useState('latest');
  const [updateState, setUpdateState] = useState(null);
  const updateAbortRef = useRef(null);

  const [diskData, setDiskData] = useState(null);
  const [diskError, setDiskError] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}/admin/status`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || r.statusText);
      }
      setData(await r.json());
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const loadDisk = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}/admin/disk`);
      if (r.status === 503) { setDiskData(null); setDiskError(null); return; }
      if (!r.ok) throw new Error(r.statusText);
      setDiskData(await r.json());
      setDiskError(null);
    } catch (e) {
      setDiskError(e.message);
    }
  }, []);

  useEffect(() => {
    loadDisk();
    const id = setInterval(loadDisk, 30000);
    return () => clearInterval(id);
  }, [loadDisk]);

  const triggerUpdate = useCallback(async () => {
    if (updateAbortRef.current) updateAbortRef.current.abort();
    const ctrl = new AbortController();
    updateAbortRef.current = ctrl;

    setUpdateState({ status: 'pending', message: 'Envoi de la requête…', progress: 5 });

    try {
      const r = await apiFetch(`${API}/admin/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_tag: targetTag }),
      });
      if (r.status === 503) {
        setUpdateState({ status: 'error', message: 'Module updater non installé.', progress: 0 });
        return;
      }
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        setUpdateState({ status: 'error', message: err.detail || r.statusText, progress: 0 });
        return;
      }

      await refreshIfNeeded();
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API}/admin/update/stream`, { headers, signal: ctrl.signal });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.slice(6));
              setUpdateState(ev);
              if (ev.status === 'done' || ev.status === 'error') return;
            } catch {}
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setUpdateState({ status: 'error', message: e.message, progress: 0 });
      }
    }
  }, [targetTag]);

  const fmt = (v) => (v === null || v === undefined ? '—' : String(v));

  return (
    <div style={s.root}>
      <div style={s.header}>
        <h2 style={s.title}>⚙ Admin</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {lastRefresh && (
            <span style={{ fontSize: '11px', color: '#555' }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button style={s.refreshBtn} onClick={load}>↻ Rafraîchir</button>
        </div>
      </div>

      <div style={s.body}>
        {loading && !data && <div style={s.spinner}>Chargement…</div>}

        {error && (
          <div style={s.errorBanner}>
            {error === 'Admin role required'
              ? '🔒 Accès refusé — rôle Keycloak "admin" requis.'
              : `Erreur : ${error}`}
          </div>
        )}

        {data?.auth_warning && (
          <div style={s.warning}>
            ⚠ AUTH_ENABLED=false — endpoint non protégé (mode développement)
          </div>
        )}

        {data && (
          <>
            {/* Replica / Leader */}
            <div style={s.card}>
              <div style={s.cardTitle}>Réplica & Scheduler</div>
              <div style={s.grid}>
                <div style={s.stat}>
                  <span style={s.statLabel}>Replica ID</span>
                  <span style={{ ...s.statValue, fontSize: '14px' }}>{fmt(data.replica_id)}</span>
                </div>
                <div style={s.stat}>
                  <span style={s.statLabel}>Rôle scheduler</span>
                  <span style={s.statValue}>
                    <span style={s.badge(data.is_leader)}>
                      {data.is_leader ? 'LEADER' : 'FOLLOWER'}
                    </span>
                  </span>
                </div>
                <div style={s.stat}>
                  <span style={s.statLabel}>Leader actuel</span>
                  <span style={{ ...s.statValue, fontSize: '14px' }}>{fmt(data.leader_id)}</span>
                </div>
              </div>
            </div>

            {/* SSE Clients */}
            <div style={s.card}>
              <div style={s.cardTitle}>Clients SSE connectés</div>
              <div style={s.grid}>
                {Object.entries(data.sse_clients || {}).map(([stream, count]) => (
                  <div key={stream} style={s.stat}>
                    <span style={s.statLabel}>{stream}</span>
                    <span style={s.statValue}>{count}</span>
                    <span style={s.statSub}>clients</span>
                  </div>
                ))}
                {!Object.keys(data.sse_clients || {}).length && (
                  <span style={s.empty}>Aucun client SSE</span>
                )}
              </div>
            </div>

            {/* Redis */}
            <div style={s.card}>
              <div style={s.cardTitle}>Redis</div>
              {!data.redis ? (
                <span style={s.empty}>Redis non connecté (mode single-instance)</span>
              ) : (
                <div style={s.grid}>
                  <div style={s.stat}>
                    <span style={s.statLabel}>Mémoire</span>
                    <span style={s.statValue}>{fmt(data.redis.memory)}</span>
                  </div>
                  <div style={s.stat}>
                    <span style={s.statLabel}>Clients</span>
                    <span style={s.statValue}>{fmt(data.redis.connected_clients)}</span>
                  </div>
                  <div style={s.stat}>
                    <span style={s.statLabel}>Ops/sec</span>
                    <span style={s.statValue}>{fmt(data.redis.ops_per_sec)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Pub/sub channels */}
            {data.redis && (
              <div style={s.card}>
                <div style={s.cardTitle}>Channels pub/sub</div>
                {!Object.keys(data.pubsub_channels || {}).length ? (
                  <span style={s.empty}>Aucun channel actif</span>
                ) : (
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Channel</th>
                        <th style={s.th}>Subscribers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.pubsub_channels).map(([ch, count]) => (
                        <tr key={ch}>
                          <td style={s.td}>{ch}</td>
                          <td style={s.td}>{count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}

        {/* Mise à jour */}
        <div style={s.card}>
          <div style={s.cardTitle}>Mise à jour</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <input
              style={s.tagInput}
              value={targetTag}
              onChange={(e) => setTargetTag(e.target.value)}
              placeholder="tag (ex: latest)"
              disabled={updateState && !['done', 'error'].includes(updateState.status)}
            />
            <button
              style={s.updateBtn(updateState && !['done', 'error'].includes(updateState.status))}
              onClick={triggerUpdate}
              disabled={updateState && !['done', 'error'].includes(updateState.status)}
            >
              ↑ Mettre à jour
            </button>
            {updateState && (
              <span style={{ fontSize: '12px', color: updateState.status === 'error' ? '#ef4444' : updateState.status === 'done' ? '#4ade80' : '#a0a0a0' }}>
                {updateState.message}
              </span>
            )}
          </div>
          {updateState && (
            <div style={s.progressBar}>
              <div style={s.progressFill(updateState.progress ?? 0, updateState.status)} />
            </div>
          )}
        </div>

        {/* Stockage */}
        <div style={s.card}>
          <div style={s.cardTitle}>Stockage</div>
          {diskError && <span style={{ color: '#ef4444', fontSize: '12px' }}>{diskError}</span>}
          {!diskData && !diskError && <span style={s.empty}>Module disk-collector non installé</span>}
          {diskData && (
            <>
              <div style={s.grid}>
                <div style={s.stat}>
                  <span style={s.statLabel}>Utilisé</span>
                  <span style={s.statValue}>{fmtBytes(diskData.used_kb)}</span>
                </div>
                <div style={s.stat}>
                  <span style={s.statLabel}>Disponible</span>
                  <span style={s.statValue}>{fmtBytes(diskData.avail_kb)}</span>
                </div>
                <div style={s.stat}>
                  <span style={s.statLabel}>Total</span>
                  <span style={s.statValue}>{fmtBytes(diskData.total_kb)}</span>
                </div>
                <div style={s.stat}>
                  <span style={s.statLabel}>Occupation</span>
                  <span style={s.statValue}>{diskData.use_pct ?? '—'}%</span>
                </div>
              </div>
              <div style={s.diskBar(diskData.use_pct)}>
                <div style={s.diskFill(diskData.use_pct ?? 0)} />
              </div>
              <div style={{ fontSize: '10px', color: '#4a4a4a', marginTop: '6px' }}>
                {diskData.path} · {diskData.collected_at}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
