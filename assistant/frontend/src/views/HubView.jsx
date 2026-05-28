import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/api.js';

const s = {
  root: {
    height: '100%',
    overflow: 'auto',
    background: '#0f0f0f',
    padding: '24px',
    fontFamily: 'inherit',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '24px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#e5e5e5',
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: '#666',
    marginTop: '2px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '16px',
  },
  card: (status) => ({
    background: '#1a1a1a',
    borderRadius: '12px',
    border: `1px solid ${status === 'ok' ? '#2a2a2a' : status === 'down' ? '#3a1a1a' : '#2a2a2a'}`,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  }),
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#e5e5e5',
  },
  emoji: {
    fontSize: '20px',
    lineHeight: 1,
  },
  dot: (status) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: status === 'ok' ? '#22c55e'
      : status === 'down' ? '#ef4444'
        : status === 'degraded' ? '#f59e0b'
          : status === 'disabled' ? '#4b5563'
            : '#6b7280',
    flexShrink: 0,
  }),
  statusLabel: (status) => ({
    fontSize: '11px',
    color: status === 'ok' ? '#22c55e'
      : status === 'down' ? '#ef4444'
        : status === 'degraded' ? '#f59e0b'
          : '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600,
  }),
  latency: {
    fontSize: '11px',
    color: '#4b5563',
    marginLeft: '4px',
  },
  stats: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  stat: {
    background: '#252525',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    color: '#9ca3af',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: 'auto',
  },
  btn: (primary) => ({
    flex: primary ? 1 : undefined,
    padding: '7px 14px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    background: primary ? '#7c3aed' : '#252525',
    color: primary ? '#fff' : '#9ca3af',
    transition: 'background 0.15s',
  }),
  refreshBtn: {
    padding: '6px 10px',
    border: 'none',
    borderRadius: '8px',
    background: '#252525',
    color: '#6b6b6b',
    cursor: 'pointer',
    fontSize: '14px',
    marginLeft: 'auto',
  },
  loading: {
    color: '#4b5563',
    fontSize: '13px',
    textAlign: 'center',
    padding: '40px 0',
  },
};

const STATUS_LABELS = {
  ok: 'En ligne',
  down: 'Hors ligne',
  degraded: 'Dégradé',
  disabled: 'Désactivé',
  external: 'Externe',
  unknown: '—',
};

export default function HubView({ onNavigate }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extraStats, setExtraStats] = useState({});

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/v1/hub/services');
      if (r.ok) {
        const data = await r.json();
        setServices(data);
        loadExtraStats(data);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadServices(); }, [loadServices]);

  async function loadExtraStats(svcList) {
    const stats = {};

    const forgeOnline = svcList.find(s => s.id === 'forge')?.status === 'ok';
    const toolhubOnline = svcList.find(s => s.id === 'toolhub')?.status === 'ok';
    const mpOnline = svcList.find(s => s.id === 'mempalace')?.status === 'ok';

    const tasks = [];

    if (forgeOnline) {
      tasks.push(
        apiFetch('/api/v1/hub/forge/agents')
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data?.agents) stats.forge = `${data.agents.length} agents`; })
          .catch(() => {})
      );
    }

    if (toolhubOnline) {
      tasks.push(
        apiFetch('/api/v1/hub/toolhub/tools')
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (Array.isArray(data)) stats.toolhub = `${data.length} outils actifs`; })
          .catch(() => {})
      );
    }

    if (mpOnline) {
      tasks.push(
        apiFetch('/api/v1/mempalace/wings')
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            const wings = Array.isArray(data) ? data : (data?.wings ?? []);
            if (wings.length) stats.mempalace = `${wings.length} wings`;
          })
          .catch(() => {})
      );
    }

    await Promise.allSettled(tasks);
    setExtraStats({ ...stats });
  }

  function openExternal(url) {
    if (url) window.open(url, '_blank', 'noopener');
  }

  function openEmbedded(viewKey) {
    if (onNavigate) onNavigate(viewKey);
  }

  if (loading) return <div style={s.root}><p style={s.loading}>Chargement…</p></div>;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <p style={s.title}>🏛️ Hub</p>
          <p style={s.subtitle}>Tous vos services en un coup d'œil</p>
        </div>
        <button style={s.refreshBtn} onClick={loadServices} title="Rafraîchir">↻</button>
      </div>

      <div style={s.grid}>
        {services.map(svc => (
          <ServiceCard
            key={svc.id}
            svc={svc}
            extra={extraStats[svc.id]}
            onOpenExternal={openExternal}
            onOpenEmbedded={openEmbedded}
          />
        ))}

        {/* Vues intégrées déjà disponibles */}
        <EmbeddedCard
          emoji="📅" label="Calendrier"
          desc="Agenda intégré"
          viewKey="calendar"
          onNavigate={openEmbedded}
        />
        <EmbeddedCard
          emoji="⚡" label="Gateway IA"
          desc="Proxy LLM & modèles"
          viewKey="gateway"
          onNavigate={openEmbedded}
        />
        <EmbeddedCard
          emoji="🧠" label="Mémoire"
          desc="MemPalace browser"
          viewKey="memory"
          onNavigate={openEmbedded}
        />
      </div>
    </div>
  );
}

function ServiceCard({ svc, extra, onOpenExternal, onOpenEmbedded }) {
  const { id, label, emoji, status, latency_ms, frontend_url } = svc;

  const canOpen = Boolean(frontend_url);
  const isExternal = status === 'external';

  return (
    <div style={s.card(status)}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>
          <span style={s.emoji}>{emoji}</span>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {!isExternal && <span style={s.dot(status)} />}
          <span style={s.statusLabel(status)}>{STATUS_LABELS[status] ?? status}</span>
          {latency_ms != null && <span style={s.latency}>{latency_ms}ms</span>}
        </div>
      </div>

      {extra && (
        <div style={s.stats}>
          <span style={s.stat}>{extra}</span>
        </div>
      )}

      <div style={s.actions}>
        {canOpen && (
          <button style={s.btn(true)} onClick={() => onOpenExternal(frontend_url)}>
            Ouvrir ↗
          </button>
        )}
        {id === 'mempalace' && (
          <button style={s.btn(!canOpen)} onClick={() => onOpenEmbedded('memory')}>
            Voir →
          </button>
        )}
        {id === 'toolhub' && (
          <button style={s.btn(!canOpen)} onClick={() => onOpenEmbedded('connections')}>
            Outils →
          </button>
        )}
      </div>
    </div>
  );
}

function EmbeddedCard({ emoji, label, desc, viewKey, onNavigate }) {
  return (
    <div style={s.card('ok')}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>
          <span style={s.emoji}>{emoji}</span>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={s.dot('ok')} />
          <span style={s.statusLabel('ok')}>Intégré</span>
        </div>
      </div>
      <div style={s.stats}>
        <span style={s.stat}>{desc}</span>
      </div>
      <div style={s.actions}>
        <button style={s.btn(true)} onClick={() => onNavigate(viewKey)}>
          Ouvrir →
        </button>
      </div>
    </div>
  );
}
