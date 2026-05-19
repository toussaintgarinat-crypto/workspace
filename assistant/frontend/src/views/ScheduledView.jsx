import { useState, useEffect } from 'react';
import { listScheduled, createScheduled, updateScheduled, deleteScheduled, runScheduled } from '../services/api.js';

const s = {
  root: {
    height: '100%',
    overflowY: 'auto',
    background: '#0f0f0f',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
    padding: '32px',
    boxSizing: 'border-box',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { fontSize: '20px', fontWeight: 700, color: '#e0e0e0' },
  addBtn: {
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' },
  cardTitle: { fontSize: '15px', fontWeight: 600, color: '#e0e0e0' },
  badge: (active) => ({
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '12px',
    background: active ? '#064e3b' : '#27272a',
    color: active ? '#6ee7b7' : '#71717a',
    border: `1px solid ${active ? '#065f46' : '#3f3f46'}`,
    fontWeight: 500,
  }),
  prompt: { fontSize: '13px', color: '#9ca3af', marginBottom: '8px', whiteSpace: 'pre-wrap' },
  meta: { fontSize: '11px', color: '#52525b', marginBottom: '10px' },
  actions: { display: 'flex', gap: '8px' },
  actionBtn: (variant) => ({
    border: 'none',
    borderRadius: '6px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    background: variant === 'run' ? '#7c3aed22' : variant === 'del' ? '#7f1d1d22' : '#27272a',
    color: variant === 'run' ? '#a78bfa' : variant === 'del' ? '#f87171' : '#9ca3af',
  }),
  form: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
  },
  formTitle: { fontSize: '15px', fontWeight: 600, marginBottom: '16px' },
  label: { fontSize: '12px', color: '#9ca3af', marginBottom: '5px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: {
    width: '100%',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '9px 12px',
    fontSize: '13px',
    boxSizing: 'border-box',
    outline: 'none',
    marginBottom: '12px',
  },
  textarea: {
    width: '100%',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '9px 12px',
    fontSize: '13px',
    boxSizing: 'border-box',
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    fontFamily: 'inherit',
    marginBottom: '12px',
  },
  hint: { fontSize: '11px', color: '#52525b', marginBottom: '12px' },
  formActions: { display: 'flex', gap: '10px' },
  saveBtn: {
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  cancelBtn: {
    background: '#27272a',
    color: '#9ca3af',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  empty: { textAlign: 'center', color: '#52525b', padding: '48px 0', fontSize: '14px' },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    background: '#065f46',
    color: '#6ee7b7',
    border: '1px solid #059669',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    zIndex: 9999,
  },
};

const emptyForm = { title: '', prompt: '', schedule: 'daily 09:00' };

function formatNextRun(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
}

export default function ScheduledView() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = () => listScheduled().then(setItems).catch(() => {});

  useEffect(() => { load(); }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.prompt.trim() || !form.schedule.trim()) return;
    setSaving(true);
    try {
      await createScheduled(form);
      setForm(emptyForm);
      setShowForm(false);
      await load();
      showToast('Prompt planifié créé');
    } catch { showToast('Erreur lors de la création'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (item) => {
    try {
      await updateScheduled(item.id, { active: !item.active });
      await load();
    } catch { showToast('Erreur'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce prompt planifié ?')) return;
    try {
      await deleteScheduled(id);
      await load();
      showToast('Supprimé');
    } catch { showToast('Erreur'); }
  };

  const handleRun = async (id) => {
    try {
      const res = await runScheduled(id);
      if (res.ok) showToast('Exécuté — résultat envoyé via notification');
      else showToast(`Erreur: ${res.error}`);
      await load();
    } catch { showToast('Erreur lors de l\'exécution'); }
  };

  return (
    <div style={s.root}>
      <div style={s.header}>
        <h2 style={s.title}>Prompts planifiés</h2>
        <button style={s.addBtn} onClick={() => setShowForm(f => !f)}>
          {showForm ? 'Annuler' : '+ Nouveau'}
        </button>
      </div>

      {showForm && (
        <div style={s.form}>
          <div style={s.formTitle}>Nouveau prompt planifié</div>

          <label style={s.label}>Titre</label>
          <input
            style={s.input}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ex: Résumé quotidien des tâches Forge"
          />

          <label style={s.label}>Prompt</label>
          <textarea
            style={s.textarea}
            value={form.prompt}
            onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
            placeholder="Ex: Donne-moi un résumé des tâches Forge ouvertes et des sprints en cours."
          />

          <label style={s.label}>Planification</label>
          <input
            style={s.input}
            value={form.schedule}
            onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
            placeholder="daily 09:00"
          />
          <p style={s.hint}>
            Formats : <code>hourly</code> · <code>daily HH:MM</code> · <code>weekly lun|mar|mer|jeu|ven|sam|dim HH:MM</code>
          </p>

          <div style={s.formActions}>
            <button style={s.saveBtn} onClick={handleCreate} disabled={saving}>
              {saving ? 'Création...' : 'Créer'}
            </button>
            <button style={s.cancelBtn} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {items.length === 0 && !showForm && (
        <div style={s.empty}>Aucun prompt planifié. Créez-en un pour commencer.</div>
      )}

      {items.map(item => (
        <div key={item.id} style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>{item.title}</span>
            <span style={s.badge(Boolean(item.active))}>{item.active ? 'Actif' : 'Inactif'}</span>
          </div>
          <p style={s.prompt}>{item.prompt}</p>
          <p style={s.meta}>
            Planif : <strong>{item.schedule}</strong>
            {item.next_run && <> · Prochain : <strong>{formatNextRun(item.next_run)}</strong></>}
            {item.last_run && <> · Dernier : {formatNextRun(item.last_run)}</>}
          </p>
          <div style={s.actions}>
            <button style={s.actionBtn('run')} onClick={() => handleRun(item.id)}>▶ Exécuter</button>
            <button style={s.actionBtn('toggle')} onClick={() => handleToggle(item)}>
              {item.active ? '⏸ Désactiver' : '▶ Activer'}
            </button>
            <button style={s.actionBtn('del')} onClick={() => handleDelete(item.id)}>✕ Supprimer</button>
          </div>
        </div>
      ))}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
