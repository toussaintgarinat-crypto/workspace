import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/api.js';

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
};

export default function AdminView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

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
      </div>
    </div>
  );
}
