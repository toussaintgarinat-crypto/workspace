import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  gatewayListModels, gatewayAddModel, gatewayDeleteModel,
  gatewayListKeys, gatewayAddKey, gatewayDeleteKey,
} from '../services/api.js';

const PROVIDERS = [
  { label: 'OpenRouter', prefix: 'openrouter/', apiBase: 'https://openrouter.ai/api/v1', needsKey: true },
  { label: 'Ollama Mac',  prefix: 'ollama/',     apiBase: '',                              needsKey: false },
  { label: 'Ollama HP',   prefix: 'ollama/',     apiBase: '',                              needsKey: false },
  { label: 'Custom',      prefix: '',             apiBase: '',                              needsKey: true  },
];

const DURATIONS = ['1d', '7d', '1mo', '3mo', '1y'];

const s = {
  container: { height: '100%', overflowY: 'auto', padding: '28px 32px' },
  header: { marginBottom: '24px' },
  title: { fontSize: '18px', fontWeight: '600', color: '#e8e8e8', marginBottom: '6px' },
  desc: { fontSize: '13px', color: '#6b6b6b' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #2a2a2a' },
  tab: (active) => ({
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #7c3aed' : '2px solid transparent',
    color: active ? '#e8e8e8' : '#6b6b6b',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: active ? '500' : '400',
    marginBottom: '-1px',
    transition: 'color 0.15s',
  }),
  section: { maxWidth: '620px' },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: { fontSize: '14px', color: '#e8e8e8', fontWeight: '500', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardSub: { fontSize: '11px', color: '#6b6b6b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  deleteBtn: {
    padding: '5px 10px',
    background: 'transparent',
    border: '1px solid #3a2a2a',
    borderRadius: '6px',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '12px',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  addCard: {
    background: '#111',
    border: '1px dashed #2a2a2a',
    borderRadius: '10px',
    padding: '20px',
    marginTop: '16px',
  },
  addTitle: { fontSize: '13px', fontWeight: '500', color: '#9b9b9b', marginBottom: '14px' },
  fieldRow: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' },
  fieldLabel: { fontSize: '11px', color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: {
    width: '100%',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    color: '#e8e8e8',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    color: '#e8e8e8',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  row: { display: 'flex', gap: '10px' },
  addBtn: (loading) => ({
    marginTop: '4px',
    padding: '8px 18px',
    background: loading ? '#2a2a2a' : '#7c3aed',
    border: 'none',
    borderRadius: '6px',
    color: loading ? '#6b6b6b' : '#fff',
    cursor: loading ? 'not-allowed' : 'pointer',
    fontSize: '13px',
    fontWeight: '500',
  }),
  error: { fontSize: '12px', color: '#ef4444', marginTop: '8px' },
  empty: { fontSize: '13px', color: '#6b6b6b', padding: '12px 0' },
  budget: { fontSize: '11px', color: '#10b981' },
};

// ── Models tab ────────────────────────────────────────────────────────────────

function ModelsTab() {
  const { t } = useTranslation();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const [providerIdx, setProviderIdx] = useState(0);
  const [modelName, setModelName] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const data = await gatewayListModels();
      setModels(data.data || []);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function onProviderChange(idx) {
    setProviderIdx(idx);
    setApiBase(PROVIDERS[idx].apiBase);
    setApiKey('');
  }

  async function handleAdd() {
    if (!modelName.trim() || !modelId.trim()) return;
    setAdding(true);
    setError('');
    const provider = PROVIDERS[providerIdx];
    const params = { model: `${provider.prefix}${modelId}` };
    if (apiBase) params.api_base = apiBase;
    if (apiKey)  params.api_key  = apiKey;
    try {
      await gatewayAddModel({ model_name: modelName.trim(), litellm_params: params });
      setModelName(''); setModelId(''); setApiKey('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    setDeleting(id);
    try {
      await gatewayDeleteModel(id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  }

  const provider = PROVIDERS[providerIdx];

  return (
    <div style={s.section}>
      {loading ? (
        <p style={s.empty}>{t('gateway.loading')}</p>
      ) : models.length === 0 ? (
        <p style={s.empty}>{t('gateway.noModels')}</p>
      ) : (
        models.map((m) => {
          const id = m.model_info?.id || m.model_name;
          return (
            <div key={id} style={s.card}>
              <div style={s.cardInfo}>
                <div style={s.cardName}>{m.model_name}</div>
                <div style={s.cardSub}>{m.litellm_params?.model || '—'}</div>
              </div>
              <button
                style={s.deleteBtn}
                onClick={() => handleDelete(id)}
                disabled={deleting === id}
              >
                {deleting === id ? '…' : t('gateway.delete')}
              </button>
            </div>
          );
        })
      )}

      <div style={s.addCard}>
        <p style={s.addTitle}>{t('gateway.addModel')}</p>

        <div style={s.row}>
          <div style={{ ...s.fieldRow, flex: 1 }}>
            <span style={s.fieldLabel}>{t('gateway.logicalName')}</span>
            <input style={s.input} placeholder="openai/gpt-5" value={modelName} onChange={(e) => setModelName(e.target.value)} />
          </div>
          <div style={{ ...s.fieldRow, flex: 1 }}>
            <span style={s.fieldLabel}>{t('gateway.provider')}</span>
            <select style={s.select} value={providerIdx} onChange={(e) => onProviderChange(Number(e.target.value))}>
              {PROVIDERS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div style={s.fieldRow}>
          <span style={s.fieldLabel}>{t('gateway.providerModelId')}</span>
          <input style={s.input} placeholder="openai/gpt-5 ou llama3.2" value={modelId} onChange={(e) => setModelId(e.target.value)} />
        </div>

        {(provider.label === 'Ollama Mac' || provider.label === 'Ollama HP') && (
          <div style={s.fieldRow}>
            <span style={s.fieldLabel}>{t('gateway.ollamaUrl')}</span>
            <input style={s.input} placeholder="http://host.docker.internal:11434" value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          </div>
        )}

        {provider.needsKey && (
          <div style={s.fieldRow}>
            <span style={s.fieldLabel}>{t('gateway.apiKey')}</span>
            <input style={s.input} type="password" placeholder="sk-or-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
        )}

        {error && <p style={s.error}>{error}</p>}
        <button style={s.addBtn(adding)} onClick={handleAdd} disabled={adding}>
          {adding ? t('gateway.adding') : t('gateway.add')}
        </button>
      </div>
    </div>
  );
}

// ── Keys tab ──────────────────────────────────────────────────────────────────

function KeysTab() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const [alias, setAlias] = useState('');
  const [budget, setBudget] = useState('10');
  const [duration, setDuration] = useState('1mo');
  const [models, setModels] = useState('');
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState('');

  async function load() {
    try {
      const data = await gatewayListKeys();
      setKeys(Array.isArray(data) ? data : (data.keys || []));
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!alias.trim()) return;
    setAdding(true);
    setError('');
    setNewKey('');
    const modelList = models.trim() ? models.split(',').map((m) => m.trim()).filter(Boolean) : 'auto';
    try {
      const res = await gatewayAddKey({ key_alias: alias.trim(), max_budget: Number(budget), budget_duration: duration, models: modelList });
      setNewKey(res.key || '');
      setAlias(''); setModels('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(key) {
    setDeleting(key);
    try {
      await gatewayDeleteKey(key);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div style={s.section}>
      {loading ? (
        <p style={s.empty}>{t('gateway.loading')}</p>
      ) : keys.length === 0 ? (
        <p style={s.empty}>{t('gateway.noKeys')}</p>
      ) : (
        keys.map((k) => {
          const key = k.token || k.key || k.api_key || '';
          const masked = key ? key.slice(0, 12) + '…' : '—';
          const spent = k.spend != null ? `${k.spend.toFixed(3)}$ / ${k.max_budget ?? '∞'}$` : null;
          return (
            <div key={key} style={s.card}>
              <div style={s.cardInfo}>
                <div style={s.cardName}>{k.key_alias || masked}</div>
                <div style={s.cardSub}>{masked}{spent ? ` · ${spent}` : ''}</div>
              </div>
              <button
                style={s.deleteBtn}
                onClick={() => handleDelete(key)}
                disabled={deleting === key}
              >
                {deleting === key ? '…' : t('gateway.delete')}
              </button>
            </div>
          );
        })
      )}

      <div style={s.addCard}>
        <p style={s.addTitle}>{t('gateway.createKey')}</p>

        <div style={s.row}>
          <div style={{ ...s.fieldRow, flex: 2 }}>
            <span style={s.fieldLabel}>{t('gateway.alias')}</span>
            <input style={s.input} placeholder="monapp" value={alias} onChange={(e) => setAlias(e.target.value)} />
          </div>
          <div style={{ ...s.fieldRow, flex: 1 }}>
            <span style={s.fieldLabel}>{t('gateway.budget')}</span>
            <input style={s.input} type="number" min="0" step="1" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <div style={{ ...s.fieldRow, flex: 1 }}>
            <span style={s.fieldLabel}>{t('gateway.duration')}</span>
            <select style={s.select} value={duration} onChange={(e) => setDuration(e.target.value)}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div style={s.fieldRow}>
          <span style={s.fieldLabel}>{t('gateway.allowedModels')}</span>
          <input style={s.input} placeholder="openai/gpt-4o, ollama/llama3.2" value={models} onChange={(e) => setModels(e.target.value)} />
        </div>

        {newKey && (
          <div style={{ ...s.fieldRow, marginBottom: '10px' }}>
            <span style={s.fieldLabel}>{t('gateway.keyGenerated')}</span>
            <input style={{ ...s.input, color: '#10b981', fontFamily: 'monospace' }} readOnly value={newKey} onClick={(e) => e.target.select()} />
          </div>
        )}

        {error && <p style={s.error}>{error}</p>}
        <button style={s.addBtn(adding)} onClick={handleAdd} disabled={adding}>
          {adding ? t('gateway.creating') : t('gateway.create')}
        </button>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function GatewayView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('models');

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h2 style={s.title}>{t('gateway.title')}</h2>
        <p style={s.desc}>{t('gateway.subtitle')}</p>
      </div>

      <div style={s.tabs}>
        <button style={s.tab(tab === 'models')} onClick={() => setTab('models')}>{t('gateway.models')}</button>
        <button style={s.tab(tab === 'keys')} onClick={() => setTab('keys')}>{t('gateway.virtualKeys')}</button>
      </div>

      {tab === 'models' ? <ModelsTab /> : <KeysTab />}
    </div>
  );
}
