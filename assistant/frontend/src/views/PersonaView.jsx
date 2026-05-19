import { useState, useEffect } from 'react';
import { getPersona, savePersona } from '../services/api.js';

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
  title: { fontSize: '20px', fontWeight: 700, color: '#e0e0e0', marginBottom: '8px' },
  subtitle: { fontSize: '13px', color: '#6b6b6b', marginBottom: '32px' },
  section: { marginBottom: '28px' },
  label: { fontSize: '12px', color: '#9ca3af', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: {
    width: '100%',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '10px 14px',
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '10px 14px',
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    fontFamily: 'inherit',
  },
  select: {
    width: '100%',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '10px 14px',
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
    cursor: 'pointer',
  },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' },
  tag: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: '#7c3aed22',
    border: '1px solid #7c3aed44',
    borderRadius: '20px',
    padding: '4px 10px',
    fontSize: '12px',
    color: '#a78bfa',
  },
  tagDel: {
    background: 'none',
    border: 'none',
    color: '#a78bfa',
    cursor: 'pointer',
    padding: 0,
    fontSize: '14px',
    lineHeight: 1,
  },
  tagInput: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '8px 12px',
    fontSize: '13px',
    outline: 'none',
    flex: 1,
  },
  row: { display: 'flex', gap: '12px', alignItems: 'center' },
  saveBtn: {
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  inferBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: '#064e3b',
    border: '1px solid #065f46',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    color: '#6ee7b7',
    marginBottom: '24px',
  },
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

const TONES = [
  { value: 'casual', label: 'Décontracté' },
  { value: 'formal', label: 'Formel' },
  { value: 'technical', label: 'Technique' },
  { value: 'friendly', label: 'Chaleureux' },
];

export default function PersonaView() {
  const [form, setForm] = useState({
    display_name: '',
    role: '',
    expertise_domains: [],
    tone: 'casual',
    language: 'fr-FR',
    custom_instructions: '',
  });
  const [tagInput, setTagInput] = useState('');
  const [inferred, setInferred] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    getPersona().then(p => {
      if (!p || !p.user_sub) return;
      setForm({
        display_name: p.display_name || '',
        role: p.role || '',
        expertise_domains: p.expertise_domains || [],
        tone: p.tone || 'casual',
        language: p.language || 'fr-FR',
        custom_instructions: p.custom_instructions || '',
      });
      if (p.inferred_data && Object.keys(p.inferred_data).length > 0) {
        setInferred(p.inferred_data);
      }
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || form.expertise_domains.includes(t)) return;
    set('expertise_domains', [...form.expertise_domains, t]);
    setTagInput('');
  };

  const removeTag = (t) => set('expertise_domains', form.expertise_domains.filter(d => d !== t));

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePersona(form);
      showToast('Profil sauvegardé');
    } catch {
      showToast('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <div style={s.root}>
      <h2 style={s.title}>Mon profil</h2>
      <p style={s.subtitle}>Ces informations personnalisent le comportement de l'assistant.</p>

      {inferred && (
        <div style={s.inferBadge}>
          ✨ Profil enrichi automatiquement par l'IA
        </div>
      )}

      <div style={s.section}>
        <label style={s.label}>Nom affiché</label>
        <input
          style={s.input}
          value={form.display_name}
          onChange={e => set('display_name', e.target.value)}
          placeholder="Ex: Alice"
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Rôle / Titre</label>
        <input
          style={s.input}
          value={form.role}
          onChange={e => set('role', e.target.value)}
          placeholder="Ex: Développeur fullstack, Chef de projet..."
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Domaines d'expertise</label>
        <div style={s.tagRow}>
          {form.expertise_domains.map(t => (
            <span key={t} style={s.tag}>
              {t}
              <button style={s.tagDel} onClick={() => removeTag(t)}>×</button>
            </span>
          ))}
        </div>
        <div style={s.row}>
          <input
            style={s.tagInput}
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
            placeholder="Ex: Python, DevOps, Finance... (Entrée pour ajouter)"
          />
          <button style={s.saveBtn} onClick={addTag}>+</button>
        </div>
      </div>

      <div style={s.section}>
        <label style={s.label}>Ton préféré</label>
        <select style={s.select} value={form.tone} onChange={e => set('tone', e.target.value)}>
          {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div style={s.section}>
        <label style={s.label}>Langue préférée</label>
        <input
          style={s.input}
          value={form.language}
          onChange={e => set('language', e.target.value)}
          placeholder="Ex: fr-FR, en-US"
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Instructions personnalisées</label>
        <textarea
          style={s.textarea}
          value={form.custom_instructions}
          onChange={e => set('custom_instructions', e.target.value)}
          placeholder="Ex: Toujours répondre avec des exemples de code. Ne pas utiliser de bullet points..."
        />
      </div>

      <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
        {saving ? 'Sauvegarde...' : 'Sauvegarder le profil'}
      </button>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
