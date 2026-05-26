import { useState, useEffect } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getPersona, savePersona, getPersonalities, createPersonality, updatePersonality, deletePersonality, reorderPersonalities } from '../services/api.js';

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  root: { height: '100%', overflowY: 'auto', background: '#0f0f0f', color: '#e0e0e0', fontFamily: 'system-ui, sans-serif', padding: '32px', boxSizing: 'border-box' },
  title: { fontSize: '20px', fontWeight: 700, color: '#e0e0e0', marginBottom: '4px' },
  subtitle: { fontSize: '13px', color: '#6b6b6b', marginBottom: '32px' },
  sectionTitle: { fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  divider: { borderTop: '1px solid #1f1f1f', margin: '28px 0' },
  section: { marginBottom: '24px' },
  label: { fontSize: '12px', color: '#9ca3af', marginBottom: '6px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: { width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e0e0e0', padding: '10px 14px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' },
  textarea: { width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e0e0e0', padding: '10px 14px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', resize: 'vertical', minHeight: '80px', fontFamily: 'inherit' },
  select: { width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e0e0e0', padding: '10px 14px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', cursor: 'pointer' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' },
  tag: { display: 'flex', alignItems: 'center', gap: '4px', background: '#7c3aed22', border: '1px solid #7c3aed44', borderRadius: '20px', padding: '4px 10px', fontSize: '12px', color: '#a78bfa' },
  tagDel: { background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1 },
  tagInput: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e0e0e0', padding: '8px 12px', fontSize: '13px', outline: 'none', flex: 1 },
  row: { display: 'flex', gap: '12px', alignItems: 'center' },
  btn: { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  btnGhost: { background: 'none', color: '#9ca3af', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer' },
  btnDanger: { background: 'none', color: '#ef4444', border: '1px solid #ef444433', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' },
  inferBadge: { display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#064e3b', border: '1px solid #065f46', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: '#6ee7b7', marginBottom: '24px' },
  toast: { position: 'fixed', bottom: '24px', right: '24px', background: '#065f46', color: '#6ee7b7', border: '1px solid #059669', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', fontWeight: 500, zIndex: 9999 },
  // Personality grid
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' },
  card: (active) => ({ background: active ? '#3b0764' : '#1a1a1a', border: `1px solid ${active ? '#7c3aed' : '#2a2a2a'}`, borderRadius: '10px', padding: '12px', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }),
  cardEmoji: { fontSize: '22px', lineHeight: 1 },
  cardLabel: (active) => ({ fontSize: '13px', fontWeight: 600, color: active ? '#c4b5fd' : '#e0e0e0' }),
  cardDesc: { fontSize: '11px', color: '#6b6b6b', lineHeight: 1.4 },
  cardActions: { display: 'flex', gap: '4px', position: 'absolute', top: '8px', right: '8px' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px', fontSize: '14px', lineHeight: 1, color: '#6b6b6b' },
  addCard: { background: '#111', border: '1px dashed #2a2a2a', borderRadius: '10px', padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#4b5563', fontSize: '13px', minHeight: '90px' },
  // Modal
  overlay: { position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#161616', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '28px', width: '480px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '16px' },
  modalTitle: { fontSize: '16px', fontWeight: 700, color: '#e0e0e0', marginBottom: '4px' },
  modalRow: { display: 'flex', gap: '10px' },
  emojiInput: { width: '60px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e0e0e0', padding: '10px', fontSize: '20px', textAlign: 'center', outline: 'none' },
  promptTextarea: { width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', color: '#e0e0e0', padding: '10px 14px', fontSize: '13px', boxSizing: 'border-box', outline: 'none', resize: 'vertical', minHeight: '120px', fontFamily: 'monospace' },
  modalFooter: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' },
};

const TONES = [
  { value: 'casual', label: 'Décontracté' },
  { value: 'formal', label: 'Formel' },
  { value: 'technical', label: 'Technique' },
  { value: 'friendly', label: 'Chaleureux' },
];

const EMPTY_MODAL = { label: '', emoji: '🤖', description: '', system_prompt: '' };

// ── Composant Modal ───────────────────────────────────────────────────────────

function PersonalityModal({ initial, onSave, onClose, loading }) {
  const [form, setForm] = useState(initial || EMPTY_MODAL);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.modalTitle}>{initial ? 'Modifier la personnalité' : 'Nouvelle personnalité'}</div>

        <div>
          <label style={s.label}>Nom</label>
          <div style={s.modalRow}>
            <input
              style={s.emojiInput}
              value={form.emoji}
              onChange={e => set('emoji', e.target.value)}
              placeholder="🤖"
              maxLength={4}
            />
            <input
              style={{ ...s.input, flex: 1 }}
              value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder="Ex: Avocat du diable, Rédacteur..."
            />
          </div>
        </div>

        <div>
          <label style={s.label}>Description courte</label>
          <input
            style={s.input}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Affiché sous la carte"
          />
        </div>

        <div>
          <label style={s.label}>Instructions système (system prompt)</label>
          <textarea
            style={s.promptTextarea}
            value={form.system_prompt}
            onChange={e => set('system_prompt', e.target.value)}
            placeholder="Ex: Tu es un avocat du diable. Pour chaque proposition, expose les failles, contre-arguments et risques..."
          />
        </div>

        <div style={s.modalFooter}>
          <button style={s.btnGhost} onClick={onClose}>Annuler</button>
          <button style={s.btn} onClick={() => onSave(form)} disabled={loading || !form.label.trim()}>
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sortable personality card ─────────────────────────────────────────────────

function SortablePersonalityCard({ p, active, onClick, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={{ ...s.card(active), ...style }} onClick={onClick}>
      <div style={s.cardActions}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', fontSize: '12px', color: '#4b5563', userSelect: 'none' }} title="Réordonner">⠿</span>
        <button style={s.iconBtn} title="Modifier" onClick={e => onEdit(e, p)}>✏️</button>
        {p.key !== 'default' && (
          <button style={s.iconBtn} title="Supprimer" onClick={e => onDelete(e, p.key)}>🗑️</button>
        )}
      </div>
      <span style={s.cardEmoji}>{p.emoji}</span>
      <span style={s.cardLabel(active)}>{p.label}</span>
      <span style={s.cardDesc}>{p.description}</span>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function PersonaView() {
  const [form, setForm] = useState({
    display_name: '', role: '', expertise_domains: [],
    tone: 'casual', language: 'fr-FR', custom_instructions: '',
    assistant_personality: 'default',
  });
  const [personalities, setPersonalities] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [inferred, setInferred] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', personality }
  const [modalLoading, setModalLoading] = useState(false);

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadPersonalities = () => getPersonalities().then(setPersonalities);

  useEffect(() => {
    loadPersonalities();
    getPersona().then(p => {
      if (!p || !p.user_sub) return;
      setForm({
        display_name: p.display_name || '',
        role: p.role || '',
        expertise_domains: p.expertise_domains || [],
        tone: p.tone || 'casual',
        language: p.language || 'fr-FR',
        custom_instructions: p.custom_instructions || '',
        assistant_personality: p.assistant_personality || 'default',
      });
      if (p.inferred_data && Object.keys(p.inferred_data).length > 0) setInferred(p.inferred_data);
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
    try { await savePersona(form); showToast('Profil sauvegardé'); }
    catch { showToast('Erreur lors de la sauvegarde'); }
    finally { setSaving(false); }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleModalSave = async (data) => {
    setModalLoading(true);
    try {
      if (modal.mode === 'create') {
        await createPersonality(data);
        showToast('Personnalité créée');
      } else {
        await updatePersonality(modal.personality.key, data);
        showToast('Personnalité mise à jour');
      }
      await loadPersonalities();
      setModal(null);
    } catch { showToast('Erreur lors de la sauvegarde'); }
    finally { setModalLoading(false); }
  };

  const handleDelete = async (e, key) => {
    e.stopPropagation();
    if (!confirm('Supprimer cette personnalité ?')) return;
    try {
      await deletePersonality(key);
      if (form.assistant_personality === key) set('assistant_personality', 'default');
      await loadPersonalities();
      showToast('Personnalité supprimée');
    } catch (err) { showToast(err.message || 'Erreur'); }
  };

  const handleEdit = (e, personality) => {
    e.stopPropagation();
    setModal({ mode: 'edit', personality });
  };

  const handleDragEnd = async ({ active: a, over }) => {
    if (!over || a.id === over.id) return;
    const oldIdx = personalities.findIndex(p => p.key === a.id);
    const newIdx = personalities.findIndex(p => p.key === over.id);
    const reordered = arrayMove(personalities, oldIdx, newIdx);
    setPersonalities(reordered);
    try { await reorderPersonalities(reordered.map(p => p.key)); }
    catch { loadPersonalities(); }
  };

  return (
    <div style={s.root}>
      <h2 style={s.title}>Mon profil</h2>
      <p style={s.subtitle}>Ces informations personnalisent le comportement de l'assistant.</p>

      {inferred && <div style={s.inferBadge}>✨ Profil enrichi automatiquement par l'IA</div>}

      {/* ── Personnalités ── */}
      <div style={s.section}>
        <p style={s.sectionTitle}>Personnalité de l'assistant</p>
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={personalities.map(p => p.key)} strategy={rectSortingStrategy}>
            <div style={s.grid}>
              {personalities.map(p => (
                <SortablePersonalityCard
                  key={p.key}
                  p={p}
                  active={form.assistant_personality === p.key}
                  onClick={() => set('assistant_personality', p.key)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
              <div style={s.addCard} onClick={() => setModal({ mode: 'create' })}>
                <span style={{ fontSize: '24px' }}>+</span>
                <span>Nouvelle personnalité</span>
              </div>
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div style={s.divider} />

      {/* ── Profil utilisateur ── */}
      <p style={s.sectionTitle}>Profil utilisateur</p>

      <div style={s.section}>
        <label style={s.label}>Nom affiché</label>
        <input style={s.input} value={form.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Ex: Alice" />
      </div>

      <div style={s.section}>
        <label style={s.label}>Rôle / Titre</label>
        <input style={s.input} value={form.role} onChange={e => set('role', e.target.value)} placeholder="Ex: Développeur fullstack, Chef de projet..." />
      </div>

      <div style={s.section}>
        <label style={s.label}>Domaines d'expertise</label>
        <div style={s.tagRow}>
          {form.expertise_domains.map(t => (
            <span key={t} style={s.tag}>
              {t}<button style={s.tagDel} onClick={() => removeTag(t)}>×</button>
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
          <button style={s.btn} onClick={addTag}>+</button>
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
        <input style={s.input} value={form.language} onChange={e => set('language', e.target.value)} placeholder="Ex: fr-FR, en-US" />
      </div>

      <div style={s.section}>
        <label style={s.label}>Instructions personnalisées</label>
        <textarea style={s.textarea} value={form.custom_instructions} onChange={e => set('custom_instructions', e.target.value)} placeholder="Ex: Toujours répondre avec des exemples de code. Ne pas utiliser de bullet points..." />
      </div>

      <button style={s.btn} onClick={handleSave} disabled={saving}>
        {saving ? 'Sauvegarde...' : 'Sauvegarder le profil'}
      </button>

      {toast && <div style={s.toast}>{toast}</div>}

      {modal && (
        <PersonalityModal
          initial={modal.mode === 'edit' ? modal.personality : null}
          onSave={handleModalSave}
          onClose={() => setModal(null)}
          loading={modalLoading}
        />
      )}
    </div>
  );
}
