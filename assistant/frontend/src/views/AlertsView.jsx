import { useState, useEffect } from 'react';
import { isPushSupported, requestPushPermission, unsubscribeFromPush } from '../services/push.js';
import { apiFetch } from '../services/api.js';

const API = import.meta.env.VITE_API_URL || '/api';

const SOURCE_COLORS = {
  forge: '#7c3aed',
  oria: '#0ea5e9',
  mempalace: '#10b981',
  assistant: '#f59e0b',
};

const SOURCE_LABELS = {
  forge: 'Forge',
  oria: 'Oria',
  mempalace: 'MemPalace',
  assistant: 'Assistant',
};

const DEFAULT_CONFIG = {
  enabled: false,
  interval_minutes: 30,
  reminder_hours: 0,
  events_config: {
    forge: { overdue_tasks: true, overdue_sprints: false },
    oria: { unread_messages: true },
    mempalace: { stale_entries: false },
  },
  channels_config: {
    inapp: true,
    telegram: { enabled: false, bot_token: '', chat_id: '' },
    discord: { enabled: false, webhook_url: '' },
  },
};

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0f0f0f',
    color: '#e5e5e5',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #2a2a2a',
    flexShrink: 0,
  },
  title: { fontSize: '16px', fontWeight: 600, color: '#e5e5e5' },
  headerActions: { display: 'flex', gap: '8px', alignItems: 'center' },
  btn: (variant = 'default') => ({
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    background: variant === 'primary' ? '#7c3aed' : variant === 'danger' ? '#dc2626' : '#2a2a2a',
    color: '#fff',
    transition: 'opacity 0.15s',
  }),
  toggle: (active) => ({
    width: '40px',
    height: '22px',
    borderRadius: '11px',
    background: active ? '#7c3aed' : '#3a3a3a',
    cursor: 'pointer',
    position: 'relative',
    border: 'none',
    transition: 'background 0.2s',
    flexShrink: 0,
  }),
  toggleKnob: (active) => ({
    position: 'absolute',
    top: '3px',
    left: active ? '21px' : '3px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.2s',
  }),
  filterBar: {
    display: 'flex',
    gap: '8px',
    padding: '12px 20px',
    borderBottom: '1px solid #1e1e1e',
    flexShrink: 0,
  },
  filterChip: (active) => ({
    padding: '4px 12px',
    borderRadius: '20px',
    border: `1px solid ${active ? '#7c3aed' : '#3a3a3a'}`,
    background: active ? '#7c3aed22' : 'transparent',
    color: active ? '#a78bfa' : '#6b6b6b',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  }),
  feed: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  alertCard: (read) => ({
    background: read ? '#1a1a1a' : '#1e1a2e',
    border: `1px solid ${read ? '#2a2a2a' : '#3d2c6e'}`,
    borderRadius: '10px',
    padding: '14px 16px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  }),
  alertHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  sourceBadge: (source) => ({
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '4px',
    background: `${SOURCE_COLORS[source] || '#6b6b6b'}22`,
    color: SOURCE_COLORS[source] || '#6b6b6b',
    flexShrink: 0,
  }),
  alertTitle: { fontSize: '14px', fontWeight: 600, color: '#e5e5e5', flex: 1 },
  alertTime: { fontSize: '11px', color: '#6b6b6b', flexShrink: 0 },
  alertBody: { fontSize: '13px', color: '#9a9a9a', lineHeight: 1.5 },
  unreadDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#7c3aed',
    flexShrink: 0,
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: '#4a4a4a',
  },
  modal: {
    position: 'fixed',
    inset: 0,
    background: '#000000aa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modalBox: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    width: '480px',
    maxWidth: '95vw',
    maxHeight: '85vh',
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  modalTitle: { fontSize: '16px', fontWeight: 700, color: '#e5e5e5' },
  section: { display: 'flex', flexDirection: 'column', gap: '10px' },
  sectionTitle: { fontSize: '12px', fontWeight: 600, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.05em' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
  label: { fontSize: '13px', color: '#c5c5c5' },
  input: {
    background: '#0f0f0f',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    color: '#e5e5e5',
    padding: '6px 10px',
    fontSize: '13px',
    width: '100%',
  },
  checkbox: { width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7c3aed' },
  modalActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
};

function Toggle({ active, onChange }) {
  return (
    <button style={s.toggle(active)} onClick={() => onChange(!active)}>
      <span style={s.toggleKnob(active)} />
    </button>
  );
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function ProactiveConfigModal({ onClose, onSaved }) {
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API}/proactive/config`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data && data.enabled !== undefined) setCfg(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const update = (path, value) => {
    setCfg(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`${API}/proactive/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      onSaved?.();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.modal} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modalBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={s.modalTitle}>Configuration — Mode Proactif</span>
          <button style={{ ...s.btn(), padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        {/* Global toggle */}
        <div style={s.section}>
          <span style={s.sectionTitle}>Surveillance</span>
          <div style={s.row}>
            <span style={s.label}>Activer le mode proactif</span>
            <Toggle active={cfg.enabled} onChange={v => update('enabled', v)} />
          </div>
          <div style={s.row}>
            <span style={s.label}>Intervalle (minutes)</span>
            <input
              style={{ ...s.input, width: '80px' }}
              type="number" min={5} max={1440}
              value={cfg.interval_minutes}
              onChange={e => update('interval_minutes', parseInt(e.target.value) || 30)}
            />
          </div>
          <div style={s.row}>
            <span style={s.label}>Rappel si actif depuis (heures, 0 = désactivé)</span>
            <input
              style={{ ...s.input, width: '80px' }}
              type="number" min={0} max={168}
              value={cfg.reminder_hours}
              onChange={e => update('reminder_hours', parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Events */}
        <div style={s.section}>
          <span style={s.sectionTitle}>Événements surveillés</span>
          {[
            { key: 'forge.overdue_tasks', label: 'Forge — Tâches en retard' },
            { key: 'forge.overdue_sprints', label: 'Forge — Sprints dépassés' },
            { key: 'oria.unread_messages', label: 'Oria — Messages récents non consultés' },
            { key: 'mempalace.stale_entries', label: 'MemPalace — Entrées sans suite (7j+)' },
          ].map(({ key, label }) => {
            const [src, evt] = key.split('.');
            const checked = cfg.events_config?.[src]?.[evt] ?? false;
            return (
              <div key={key} style={s.row}>
                <span style={s.label}>{label}</span>
                <input
                  type="checkbox"
                  style={s.checkbox}
                  checked={checked}
                  onChange={e => update(`events_config.${src}.${evt}`, e.target.checked)}
                />
              </div>
            );
          })}
        </div>

        {/* Channels */}
        <div style={s.section}>
          <span style={s.sectionTitle}>Canaux de notification</span>

          {/* In-app always on */}
          <div style={s.row}>
            <span style={s.label}>In-app (chat Alertes)</span>
            <input type="checkbox" style={s.checkbox} checked disabled />
          </div>

          {/* Telegram */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: '#111', borderRadius: '8px' }}>
            <div style={s.row}>
              <span style={{ ...s.label, fontWeight: 600 }}>Telegram</span>
              <Toggle
                active={cfg.channels_config?.telegram?.enabled ?? false}
                onChange={v => update('channels_config.telegram.enabled', v)}
              />
            </div>
            {cfg.channels_config?.telegram?.enabled && (<>
              <input
                style={s.input}
                placeholder="Bot Token (ex: 123456:ABC-DEF...)"
                value={cfg.channels_config?.telegram?.bot_token || ''}
                onChange={e => update('channels_config.telegram.bot_token', e.target.value)}
              />
              <input
                style={s.input}
                placeholder="Chat ID (ex: -1001234567890)"
                value={cfg.channels_config?.telegram?.chat_id || ''}
                onChange={e => update('channels_config.telegram.chat_id', e.target.value)}
              />
            </>)}
          </div>

          {/* Discord */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: '#111', borderRadius: '8px' }}>
            <div style={s.row}>
              <span style={{ ...s.label, fontWeight: 600 }}>Discord</span>
              <Toggle
                active={cfg.channels_config?.discord?.enabled ?? false}
                onChange={v => update('channels_config.discord.enabled', v)}
              />
            </div>
            {cfg.channels_config?.discord?.enabled && (
              <input
                style={s.input}
                placeholder="Webhook URL (https://discord.com/api/webhooks/...)"
                value={cfg.channels_config?.discord?.webhook_url || ''}
                onChange={e => update('channels_config.discord.webhook_url', e.target.value)}
              />
            )}
          </div>
        </div>

        <div style={s.modalActions}>
          <button style={s.btn()} onClick={onClose}>Annuler</button>
          <button style={s.btn('primary')} onClick={save} disabled={saving}>
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AlertsView() {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showConfig, setShowConfig] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pushPerm, setPushPerm] = useState(() =>
    isPushSupported() ? Notification.permission : 'unsupported'
  );

  const loadAlerts = async () => {
    try {
      const r = await apiFetch(`${API}/proactive/alerts?limit=200`);
      if (r.ok) setAlerts(await r.json());
    } catch {}
  };

  const loadStatus = async () => {
    try {
      const r = await apiFetch(`${API}/proactive/status`);
      if (r.ok) {
        const d = await r.json();
        setEnabled(d.enabled);
      }
    } catch {}
  };

  useEffect(() => {
    loadAlerts();
    loadStatus();
  }, []);

  const markRead = async (id) => {
    try {
      await apiFetch(`${API}/proactive/alerts/${id}/read`, { method: 'POST' });
    } catch {}
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  const manualCheck = async () => {
    setChecking(true);
    try {
      await apiFetch(`${API}/proactive/check`, { method: 'POST' });
      setTimeout(loadAlerts, 2000);
    } catch {}
    finally { setChecking(false); }
  };

  const handlePushToggle = async () => {
    if (pushPerm === 'granted') {
      await unsubscribeFromPush();
      setPushPerm('default');
    } else {
      const perm = await requestPushPermission();
      setPushPerm(perm);
    }
  };

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.source === filter);
  const unread = alerts.filter(a => !a.read).length;

  return (
    <div style={s.root}>
      {showConfig && (
        <ProactiveConfigModal
          onClose={() => setShowConfig(false)}
          onSaved={() => { loadAlerts(); loadStatus(); }}
        />
      )}

      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={s.title}>Alertes</span>
          {unread > 0 && (
            <span style={{ background: '#7c3aed', color: '#fff', borderRadius: '10px', fontSize: '11px', fontWeight: 700, padding: '2px 7px' }}>
              {unread}
            </span>
          )}
        </div>
        <div style={s.headerActions}>
          {enabled && (
            <button style={s.btn()} onClick={manualCheck} disabled={checking}>
              {checking ? '⏳' : '🔍 Vérifier'}
            </button>
          )}
          {pushPerm !== 'unsupported' && pushPerm !== 'denied' && (
            <button
              style={s.btn(pushPerm === 'granted' ? 'primary' : 'default')}
              onClick={handlePushToggle}
              title={pushPerm === 'granted' ? 'Désactiver les push' : 'Activer les notifications push'}
            >
              {pushPerm === 'granted' ? '🔔 Push actif' : '🔔 Push off'}
            </button>
          )}
          <button style={s.btn('primary')} onClick={() => setShowConfig(true)}>⚙️ Config</button>
        </div>
      </div>

      {!enabled && (
        <div style={{ padding: '10px 20px', background: '#1e1a0a', borderBottom: '1px solid #3a2a00', fontSize: '13px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚠️</span>
          <span>Mode proactif désactivé — active-le dans ⚙️ Config pour recevoir des alertes automatiques.</span>
        </div>
      )}

      <div style={s.filterBar}>
        {['all', 'forge', 'oria', 'mempalace', 'assistant'].map(src => (
          <button key={src} style={s.filterChip(filter === src)} onClick={() => setFilter(src)}>
            {src === 'all' ? 'Tout' : SOURCE_LABELS[src]}
          </button>
        ))}
      </div>

      <div style={s.feed}>
        {filtered.length === 0 ? (
          <div style={s.empty}>
            <span style={{ fontSize: '32px' }}>🔔</span>
            <span style={{ fontSize: '14px' }}>Aucune alerte{filter !== 'all' ? ` pour ${SOURCE_LABELS[filter]}` : ''}</span>
          </div>
        ) : (
          filtered.map(alert => (
            <div
              key={alert.id}
              style={s.alertCard(alert.read)}
              onClick={() => !alert.read && markRead(alert.id)}
            >
              <div style={s.alertHeader}>
                {!alert.read && <span style={s.unreadDot} />}
                <span style={s.sourceBadge(alert.source)}>{SOURCE_LABELS[alert.source] || alert.source}</span>
                <span style={s.alertTitle}>{alert.title}</span>
                <span style={s.alertTime}>{timeAgo(alert.created_at)}</span>
              </div>
              <div style={s.alertBody}>{alert.body}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
