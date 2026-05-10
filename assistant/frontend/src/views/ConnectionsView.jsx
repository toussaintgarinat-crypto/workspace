import { useState, useEffect } from 'react';
import { getConnections, upsertConnection } from '../services/api.js';

const APP_TYPES = [
  { type: 'mempalace', label: 'MemPalace', icon: '🧠', desc: 'Mémoire vectorielle et notes' },
  { type: 'forge',     label: 'Forge',     icon: '⚒',  desc: 'Gestion de tâches et projets' },
  { type: 'oria',      label: 'Oria',      icon: '🌍', desc: 'Mondes et univers créatifs' },
];

const s = {
  container: {
    height: '100%',
    overflowY: 'auto',
    padding: '28px 32px',
  },
  header: {
    marginBottom: '28px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#e8e8e8',
    marginBottom: '6px',
  },
  desc: {
    fontSize: '13px',
    color: '#6b6b6b',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '560px',
  },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '20px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  cardTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  icon: {
    fontSize: '20px',
  },
  label: {
    fontSize: '15px',
    fontWeight: '500',
    color: '#e8e8e8',
  },
  appDesc: {
    fontSize: '12px',
    color: '#6b6b6b',
    marginTop: '1px',
  },
  badge: (status) => ({
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: '500',
    background: status === 'ok' ? '#10b98122' : '#2a2a2a',
    color: status === 'ok' ? '#10b981' : '#6b6b6b',
    border: `1px solid ${status === 'ok' ? '#10b98144' : '#3a3a3a'}`,
  }),
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '14px',
  },
  fieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldLabel: {
    fontSize: '11px',
    color: '#6b6b6b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    width: '100%',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    color: '#e8e8e8',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  showBtn: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#6b6b6b',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '0 2px',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  toggle: (enabled) => ({
    width: '36px',
    height: '20px',
    background: enabled ? '#7c3aed' : '#2a2a2a',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s',
    flexShrink: 0,
  }),
  toggleKnob: (enabled) => ({
    position: 'absolute',
    top: '3px',
    left: enabled ? '18px' : '3px',
    width: '14px',
    height: '14px',
    background: '#fff',
    borderRadius: '50%',
    transition: 'left 0.2s',
  }),
  toggleLabel: {
    fontSize: '13px',
    color: '#9b9b9b',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  btnTest: {
    padding: '7px 14px',
    background: 'transparent',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    color: '#9b9b9b',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'border-color 0.15s, color 0.15s',
  },
  btnSave: (saving) => ({
    padding: '7px 16px',
    background: saving ? '#2a2a2a' : '#7c3aed',
    border: 'none',
    borderRadius: '6px',
    color: saving ? '#6b6b6b' : '#fff',
    cursor: saving ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: '500',
    transition: 'background 0.15s',
  }),
  latency: {
    fontSize: '11px',
    color: '#10b981',
    marginLeft: 'auto',
    alignSelf: 'center',
  },
  error: {
    fontSize: '11px',
    color: '#ef4444',
    marginLeft: 'auto',
    alignSelf: 'center',
  },
};

function ConnectionCard({ appType, existingConn, onSaved }) {
  const [url, setUrl] = useState(existingConn?.url || '');
  const [token, setToken] = useState(existingConn?.token || '');
  const [enabled, setEnabled] = useState(existingConn?.enabled ?? false);
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState(existingConn ? 'ok' : 'none');
  const [latency, setLatency] = useState(null);
  const [testError, setTestError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    if (!url) return;
    setTesting(true);
    setTestError(null);
    setLatency(null);
    const start = Date.now();
    try {
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLatency(Date.now() - start);
      setStatus('ok');
    } catch (err) {
      setTestError(err.message);
      setStatus('err');
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await upsertConnection({ type: appType.type, url, token, enabled });
      onSaved();
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  }

  const badgeStatus = status === 'ok' ? 'ok' : 'none';

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <div style={s.cardTitle}>
          <span style={s.icon}>{appType.icon}</span>
          <div>
            <div style={s.label}>{appType.label}</div>
            <div style={s.appDesc}>{appType.desc}</div>
          </div>
        </div>
        <span style={s.badge(badgeStatus)}>
          {status === 'ok' ? '● Connecté' : '○ Non testé'}
        </span>
      </div>

      <div style={s.fieldGroup}>
        <div style={s.fieldRow}>
          <span style={s.fieldLabel}>URL</span>
          <input
            style={s.input}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={`http://localhost:XXXX`}
          />
        </div>
        <div style={s.fieldRow}>
          <span style={s.fieldLabel}>Token API</span>
          <div style={s.inputWrap}>
            <input
              style={{ ...s.input, paddingRight: '36px' }}
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk-…"
            />
            <button style={s.showBtn} onClick={() => setShowToken(!showToken)}>
              {showToken ? '🙈' : '👁'}
            </button>
          </div>
        </div>
        <div style={s.toggleRow}>
          <button style={s.toggle(enabled)} onClick={() => setEnabled(!enabled)}>
            <span style={s.toggleKnob(enabled)} />
          </button>
          <span style={s.toggleLabel}>{enabled ? 'Activée' : 'Désactivée'}</span>
        </div>
      </div>

      <div style={s.actions}>
        <button
          style={s.btnTest}
          onClick={handleTest}
          disabled={testing || !url}
        >
          {testing ? 'Test…' : 'Tester'}
        </button>
        <button
          style={s.btnSave(saving)}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
        {latency !== null && (
          <span style={s.latency}>{latency} ms</span>
        )}
        {testError && (
          <span style={s.error}>{testError}</span>
        )}
      </div>
    </div>
  );
}

export default function ConnectionsView() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await getConnections();
      setConnections(Array.isArray(data) ? data : []);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function getConn(type) {
    return connections.find((c) => c.type === type) || null;
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h2 style={s.title}>Connexions aux apps</h2>
        <p style={s.desc}>
          Activez les apps pour enrichir les capacités de l'Assistant
        </p>
      </div>

      {loading ? (
        <p style={{ color: '#6b6b6b', fontSize: '13px' }}>Chargement…</p>
      ) : (
        <div style={s.grid}>
          {APP_TYPES.map((appType) => (
            <ConnectionCard
              key={appType.type}
              appType={appType}
              existingConn={getConn(appType.type)}
              onSaved={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
