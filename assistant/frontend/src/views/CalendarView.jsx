import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listCalendars, createCalendar, updateCalendar, deleteCalendar,
  listEvents, createEvent, updateEvent, deleteEvent, subscribeCalendarSSE,
  listMembers, addMember, removeMember, createInvitation,
} from '../services/calendarApi.js';

// ── Palette de couleurs proposées ──────────────────────────────────────────────
const COLORS = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

// ── Helpers date ───────────────────────────────────────────────────────────────
const DOW = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function getMonthGrid(year, month) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDow).fill(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function dayKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toISOString().slice(0, 16);
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  root: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
    background: '#0f0f0f',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
  },

  // Sidebar gauche
  sidebar: {
    width: '220px',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 12px',
    gap: '4px',
    overflowY: 'auto',
    flexShrink: 0,
  },
  sideTitle: { fontSize: '11px', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', paddingLeft: '4px' },
  addCalBtn: {
    width: '100%',
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '12px',
  },
  calItem: (active, color) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 8px',
    borderRadius: '8px',
    cursor: 'pointer',
    background: active ? '#1f1f1f' : 'transparent',
    border: active ? `1px solid ${color}44` : '1px solid transparent',
    transition: 'background 0.15s',
  }),
  calDot: (color) => ({
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  calName: { fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  roleBadge: {
    fontSize: '9px',
    color: '#9ca3af',
    background: '#1f1f1f',
    borderRadius: '3px',
    padding: '1px 4px',
    flexShrink: 0,
    border: '1px solid #2a2a2a',
  },
  calActions: { display: 'flex', gap: '2px', opacity: 0 },
  calActionBtn: (danger) => ({
    border: 'none',
    background: 'transparent',
    color: danger ? '#f87171' : '#6b6b6b',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 4px',
    borderRadius: '4px',
  }),

  // Zone principale
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },

  // Header mois
  monthHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: '1px solid #2a2a2a',
    flexShrink: 0,
  },
  monthTitle: { fontSize: '18px', fontWeight: 700, flex: 1 },
  navBtn: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    color: '#e0e0e0',
    borderRadius: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  todayBtn: {
    background: '#7c3aed22',
    border: '1px solid #7c3aed44',
    color: '#a78bfa',
    borderRadius: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },

  // Grille
  gridWrap: { flex: 1, overflowY: 'auto', padding: '0 12px 12px' },
  dowRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    borderBottom: '1px solid #1f1f1f',
    position: 'sticky',
    top: 0,
    background: '#0f0f0f',
    zIndex: 1,
  },
  dowCell: {
    padding: '10px 0 8px',
    textAlign: 'center',
    fontSize: '11px',
    fontWeight: 600,
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  weekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' },
  dayCell: (isToday, isOtherMonth, clickable) => ({
    minHeight: '100px',
    border: '1px solid #1a1a1a',
    padding: '6px 8px',
    cursor: clickable && !isOtherMonth ? 'pointer' : 'default',
    background: isToday ? '#1a1a2e' : 'transparent',
    transition: 'background 0.1s',
    position: 'relative',
  }),
  dayNum: (isToday) => ({
    fontSize: '12px',
    fontWeight: isToday ? 700 : 400,
    color: isToday ? '#a78bfa' : '#71717a',
    marginBottom: '4px',
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    background: isToday ? '#7c3aed22' : 'transparent',
  }),
  eventPill: (color) => ({
    display: 'block',
    width: '100%',
    background: `${color}22`,
    border: `1px solid ${color}55`,
    color: color,
    borderRadius: '4px',
    padding: '2px 5px',
    fontSize: '11px',
    fontWeight: 500,
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    textAlign: 'left',
  }),
  moreEvents: {
    fontSize: '10px',
    color: '#52525b',
    paddingTop: '2px',
  },

  // Overlay / modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#00000088',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '16px',
    padding: '24px',
    width: '440px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 24px 64px #000a',
  },
  modalTitle: { fontSize: '17px', fontWeight: 700, marginBottom: '20px' },
  label: { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '5px' },
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
    marginBottom: '14px',
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
    minHeight: '72px',
    fontFamily: 'inherit',
    marginBottom: '14px',
  },
  row: { display: 'flex', gap: '10px', marginBottom: '14px' },
  halfInput: {
    flex: 1,
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '9px 12px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e0e0e0',
    padding: '9px 10px',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
  },
  colorRow: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' },
  colorSwatch: (c, sel) => ({
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: c,
    border: sel ? '3px solid #fff' : '3px solid transparent',
    cursor: 'pointer',
    flexShrink: 0,
  }),
  checkRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '13px', color: '#9ca3af' },
  formActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' },
  btnPrimary: {
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '9px 20px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDanger: {
    background: '#7f1d1d22',
    color: '#f87171',
    border: '1px solid #7f1d1d44',
    borderRadius: '8px',
    padding: '9px 16px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  btnCancel: {
    background: '#27272a',
    color: '#9ca3af',
    border: 'none',
    borderRadius: '8px',
    padding: '9px 16px',
    fontSize: '13px',
    cursor: 'pointer',
  },

  // Empty
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: '#52525b' },
  emptyIcon: { fontSize: '40px' },
  emptyText: { fontSize: '14px' },

  // Toast
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

  // Share modal members row
  memberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 0',
    borderBottom: '1px solid #1f1f1f',
  },
};

// ── Composant CalendarForm ─────────────────────────────────────────────────────
function CalendarFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    color: initial?.color || '#3B82F6',
    description: initial?.description || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.modalTitle}>{initial ? 'Modifier le calendrier' : 'Nouveau calendrier'}</div>

        <label style={s.label}>Nom</label>
        <input style={s.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mon calendrier" autoFocus />

        <label style={s.label}>Description</label>
        <textarea style={s.textarea} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="(optionnel)" />

        <label style={s.label}>Couleur</label>
        <div style={s.colorRow}>
          {COLORS.map(c => (
            <div key={c} style={s.colorSwatch(c, form.color === c)} onClick={() => setForm(f => ({ ...f, color: c }))} />
          ))}
        </div>

        <div style={s.formActions}>
          <button style={s.btnCancel} onClick={onClose}>Annuler</button>
          <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Composant EventFormModal ───────────────────────────────────────────────────
function EventFormModal({ initial, defaultDay, onSave, onDelete, onClose }) {
  const defaultStart = defaultDay
    ? `${defaultDay}T09:00`
    : toLocalDatetimeValue(initial?.start_at) || new Date().toISOString().slice(0, 16);
  const defaultEnd = defaultDay
    ? `${defaultDay}T10:00`
    : toLocalDatetimeValue(initial?.end_at) || new Date().toISOString().slice(0, 16);

  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    start_at: initial ? toLocalDatetimeValue(initial.start_at) : defaultStart,
    end_at: initial ? toLocalDatetimeValue(initial.end_at) : defaultEnd,
    location: initial?.location || '',
    color: initial?.color || null,
    all_day: initial?.all_day || false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        color: form.color || undefined,
        description: form.description || undefined,
        location: form.location || undefined,
      };
      await onSave(body);
    } finally { setSaving(false); }
  };

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.modalTitle}>{initial ? 'Modifier l\'événement' : 'Nouvel événement'}</div>

        <label style={s.label}>Titre</label>
        <input style={s.input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Titre de l'événement" autoFocus />

        <label style={s.label}>Description</label>
        <textarea style={s.textarea} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="(optionnel)" />

        <div style={s.checkRow}>
          <input type="checkbox" id="all_day" checked={form.all_day} onChange={e => setForm(f => ({ ...f, all_day: e.target.checked }))} />
          <label htmlFor="all_day">Toute la journée</label>
        </div>

        {!form.all_day && (
          <div style={s.row}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Début</label>
              <input type="datetime-local" style={s.halfInput} value={form.start_at} onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Fin</label>
              <input type="datetime-local" style={s.halfInput} value={form.end_at} onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))} />
            </div>
          </div>
        )}

        {form.all_day && (
          <div style={s.row}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Début</label>
              <input type="date" style={s.halfInput} value={form.start_at.slice(0, 10)} onChange={e => setForm(f => ({ ...f, start_at: e.target.value + 'T00:00', end_at: e.target.value + 'T23:59' }))} />
            </div>
          </div>
        )}

        <label style={s.label}>Lieu</label>
        <input style={s.input} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="(optionnel)" />

        <label style={s.label}>Couleur personnalisée</label>
        <div style={s.colorRow}>
          <div style={s.colorSwatch('#0000', form.color === null)} onClick={() => setForm(f => ({ ...f, color: null }))} title="Couleur du calendrier" />
          {COLORS.map(c => (
            <div key={c} style={s.colorSwatch(c, form.color === c)} onClick={() => setForm(f => ({ ...f, color: c }))} />
          ))}
        </div>

        <div style={{ ...s.formActions, justifyContent: initial ? 'space-between' : 'flex-end' }}>
          {initial && (
            <button style={s.btnDanger} onClick={onDelete}>Supprimer</button>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={s.btnCancel} onClick={onClose}>Annuler</button>
            <button style={s.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Composant ShareModal ───────────────────────────────────────────────────────
function ShareModal({ cal, onClose }) {
  const [members, setMembers] = useState([]);
  const [addForm, setAddForm] = useState({ user_id: '', role: 'viewer' });
  const [adding, setAdding] = useState(false);
  const [invRole, setInvRole] = useState('viewer');
  const [invLink, setInvLink] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const loadMembers = async () => {
    try { setMembers(await listMembers(cal.id)); } catch {}
  };

  useEffect(() => { loadMembers(); }, []);

  const handleAddMember = async () => {
    if (!addForm.user_id.trim()) return;
    setAdding(true);
    setErr('');
    try {
      await addMember(cal.id, addForm);
      await loadMembers();
      setAddForm({ user_id: '', role: 'viewer' });
    } catch (e) {
      setErr(e.message || 'Erreur');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('Retirer ce membre ?')) return;
    await removeMember(cal.id, userId);
    await loadMembers();
  };

  const handleGenerateInvite = async () => {
    setGenerating(true);
    setInvLink(null);
    try {
      const inv = await createInvitation(cal.id, { role: invRole, expires_in_hours: 72 });
      const base = (import.meta.env.VITE_CALENDAR_URL || 'http://localhost:8400');
      setInvLink(`${base}/invitations/${inv.token}/accept`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(invLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.modalTitle}>Partager · {cal.name}</div>

        {/* Membres actuels */}
        <label style={s.label}>Membres ({members.length})</label>
        {members.length === 0 && (
          <div style={{ fontSize: '12px', color: '#52525b', marginBottom: '12px' }}>Aucun membre partagé</div>
        )}
        {members.map(m => (
          <div key={m.id} style={s.memberRow}>
            <span style={{ flex: 1, fontSize: '12px', color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.user_id}
            </span>
            <span style={{ fontSize: '10px', color: '#a78bfa', background: '#7c3aed22', borderRadius: '4px', padding: '2px 6px', flexShrink: 0 }}>
              {m.role === 'editor' ? 'Éditeur' : 'Lecteur'}
            </span>
            <button
              style={{ ...s.calActionBtn(true), opacity: 1, fontSize: '13px', padding: '2px 6px' }}
              onClick={() => handleRemoveMember(m.user_id)}
              title="Retirer"
            >✕</button>
          </div>
        ))}

        {/* Ajouter un membre direct */}
        <label style={{ ...s.label, marginTop: '16px' }}>Ajouter directement</label>
        {err && <div style={{ fontSize: '12px', color: '#f87171', marginBottom: '8px' }}>{err}</div>}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            style={{ ...s.input, flex: 1, marginBottom: 0 }}
            placeholder="user_id"
            value={addForm.user_id}
            onChange={e => setAddForm(f => ({ ...f, user_id: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAddMember()}
          />
          <select
            style={s.select}
            value={addForm.role}
            onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
          >
            <option value="viewer">Lecteur</option>
            <option value="editor">Éditeur</option>
          </select>
          <button style={{ ...s.btnPrimary, padding: '9px 16px' }} onClick={handleAddMember} disabled={adding}>
            {adding ? '...' : 'Ajouter'}
          </button>
        </div>

        {/* Lien d'invitation */}
        <label style={s.label}>Lien d'invitation (72h)</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <select
            style={s.select}
            value={invRole}
            onChange={e => setInvRole(e.target.value)}
          >
            <option value="viewer">Lecteur</option>
            <option value="editor">Éditeur</option>
          </select>
          <button style={s.btnPrimary} onClick={handleGenerateInvite} disabled={generating}>
            {generating ? '...' : 'Générer'}
          </button>
        </div>
        {invLink && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
            <input
              style={{ ...s.input, flex: 1, marginBottom: 0, fontSize: '11px', color: '#9ca3af' }}
              readOnly
              value={invLink}
            />
            <button style={{ ...s.btnPrimary, padding: '9px 14px', flexShrink: 0 }} onClick={handleCopy}>
              {copied ? '✓' : 'Copier'}
            </button>
          </div>
        )}

        <div style={s.formActions}>
          <button style={s.btnCancel} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function CalendarView() {
  const today = new Date();
  const [calendars, setCalendars] = useState([]);
  const [selectedCalId, setSelectedCalId] = useState(null);
  const [events, setEvents] = useState([]);
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [showCalForm, setShowCalForm] = useState(false);
  const [editCal, setEditCal] = useState(null);
  const [shareCalId, setShareCalId] = useState(null);
  const [eventModal, setEventModal] = useState(null); // { mode: 'create'|'edit', day?, event? }
  const [hoveredCal, setHoveredCal] = useState(null);
  const [toast, setToast] = useState('');
  const unsubRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Chargement calendriers
  const loadCalendars = useCallback(async () => {
    try {
      const cals = await listCalendars();
      setCalendars(cals);
      if (cals.length > 0 && !selectedCalId) {
        const def = cals.find(c => c.is_default) || cals[0];
        setSelectedCalId(def.id);
      }
    } catch { /* service peut être hors ligne */ }
  }, [selectedCalId]);

  useEffect(() => { loadCalendars(); }, []);

  // Chargement événements du mois courant
  const loadEvents = useCallback(async (calId, year, m) => {
    if (!calId) return;
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0, 23, 59, 59);
    try {
      const evts = await listEvents(calId, start, end);
      setEvents(evts);
    } catch { setEvents([]); }
  }, []);

  useEffect(() => {
    loadEvents(selectedCalId, month.year, month.month);
  }, [selectedCalId, month]);

  // SSE subscription
  useEffect(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (!selectedCalId) return;
    const unsub = subscribeCalendarSSE(selectedCalId, (data) => {
      if (['event.created', 'event.updated', 'event.deleted'].includes(data.type)) {
        loadEvents(selectedCalId, month.year, month.month);
      }
    });
    unsubRef.current = unsub;
    return () => { unsub(); unsubRef.current = null; };
  }, [selectedCalId]);

  // ── Handlers calendriers ──────────────────────────────────────────────────────
  const handleCreateCal = async (form) => {
    await createCalendar(form);
    await loadCalendars();
    setShowCalForm(false);
    showToast('Calendrier créé');
  };

  const handleUpdateCal = async (form) => {
    await updateCalendar(editCal.id, form);
    await loadCalendars();
    setEditCal(null);
    showToast('Calendrier modifié');
  };

  const handleDeleteCal = async (calId) => {
    if (!confirm('Supprimer ce calendrier et tous ses événements ?')) return;
    await deleteCalendar(calId);
    const remaining = calendars.filter(c => c.id !== calId);
    setCalendars(remaining);
    if (selectedCalId === calId) setSelectedCalId(remaining[0]?.id || null);
    showToast('Calendrier supprimé');
  };

  // ── Handlers événements ───────────────────────────────────────────────────────
  const handleCreateEvent = async (body) => {
    await createEvent(selectedCalId, body);
    await loadEvents(selectedCalId, month.year, month.month);
    setEventModal(null);
    showToast('Événement créé');
  };

  const handleUpdateEvent = async (body) => {
    await updateEvent(eventModal.event.id, body);
    await loadEvents(selectedCalId, month.year, month.month);
    setEventModal(null);
    showToast('Événement modifié');
  };

  const handleDeleteEvent = async () => {
    if (!confirm('Supprimer cet événement ?')) return;
    await deleteEvent(eventModal.event.id);
    await loadEvents(selectedCalId, month.year, month.month);
    setEventModal(null);
    showToast('Événement supprimé');
  };

  // ── Navigation mois ───────────────────────────────────────────────────────────
  const prevMonth = () => setMonth(m => {
    if (m.month === 0) return { year: m.year - 1, month: 11 };
    return { year: m.year, month: m.month - 1 };
  });
  const nextMonth = () => setMonth(m => {
    if (m.month === 11) return { year: m.year + 1, month: 0 };
    return { year: m.year, month: m.month + 1 };
  });
  const goToday = () => setMonth({ year: today.getFullYear(), month: today.getMonth() });

  // ── Grille ────────────────────────────────────────────────────────────────────
  const weeks = getMonthGrid(month.year, month.month);

  const eventsForDay = (day) => {
    if (!day) return [];
    const key = dayKey(month.year, month.month, day);
    return events.filter(e => e.start_at.startsWith(key));
  };

  const selectedCal = calendars.find(c => c.id === selectedCalId);
  const canEdit = selectedCal && selectedCal.role !== 'viewer';

  return (
    <div style={s.root}>

      {/* ── Sidebar calendriers ─────────────────────────────────────────────── */}
      <aside style={s.sidebar}>
        <div style={s.sideTitle}>Mes Calendriers</div>
        <button style={s.addCalBtn} onClick={() => setShowCalForm(true)}>+ Nouveau</button>

        {calendars.map(cal => (
          <div
            key={cal.id}
            style={s.calItem(cal.id === selectedCalId, cal.color)}
            onClick={() => setSelectedCalId(cal.id)}
            onMouseEnter={() => setHoveredCal(cal.id)}
            onMouseLeave={() => setHoveredCal(null)}
          >
            <div style={s.calDot(cal.color)} />
            <span style={s.calName} title={cal.name}>{cal.name}</span>
            {cal.role !== 'owner' && (
              <span style={s.roleBadge}>{cal.role === 'editor' ? 'Édit.' : 'Lect.'}</span>
            )}
            <span style={{ ...s.calActions, opacity: hoveredCal === cal.id ? 1 : 0 }}>
              {cal.role === 'owner' && (
                <button
                  style={s.calActionBtn(false)}
                  onClick={(e) => { e.stopPropagation(); setShareCalId(cal.id); }}
                  title="Partager"
                >🔗</button>
              )}
              {cal.role !== 'viewer' && (
                <button
                  style={s.calActionBtn(false)}
                  onClick={(e) => { e.stopPropagation(); setEditCal(cal); }}
                  title="Modifier"
                >✎</button>
              )}
              {cal.role === 'owner' && (
                <button
                  style={s.calActionBtn(true)}
                  onClick={(e) => { e.stopPropagation(); handleDeleteCal(cal.id); }}
                  title="Supprimer"
                >✕</button>
              )}
            </span>
          </div>
        ))}

        {calendars.length === 0 && (
          <div style={{ fontSize: '12px', color: '#52525b', textAlign: 'center', marginTop: '16px' }}>
            Aucun calendrier
          </div>
        )}
      </aside>

      {/* ── Zone principale ─────────────────────────────────────────────────── */}
      <div style={s.main}>

        {/* Header mois */}
        <div style={s.monthHeader}>
          <button style={s.navBtn} onClick={prevMonth}>‹</button>
          <button style={s.navBtn} onClick={nextMonth}>›</button>
          <span style={s.monthTitle}>{MONTHS[month.month]} {month.year}</span>
          <button style={s.todayBtn} onClick={goToday}>Aujourd'hui</button>
          {selectedCal && canEdit && (
            <button
              style={{ ...s.todayBtn, background: `${selectedCal.color}22`, border: `1px solid ${selectedCal.color}44`, color: selectedCal.color }}
              onClick={() => setEventModal({ mode: 'create', day: dayKey(today.getFullYear(), today.getMonth(), today.getDate()) })}
            >
              + Événement
            </button>
          )}
        </div>

        {/* Grille */}
        {!selectedCalId ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>📅</div>
            <div style={s.emptyText}>Sélectionnez ou créez un calendrier</div>
          </div>
        ) : (
          <div style={s.gridWrap}>
            {/* En-têtes jours */}
            <div style={s.dowRow}>
              {DOW.map(d => <div key={d} style={s.dowCell}>{d}</div>)}
            </div>

            {/* Semaines */}
            {weeks.map((week, wi) => (
              <div key={wi} style={s.weekRow}>
                {week.map((day, di) => {
                  const isToday = day !== null
                    && month.year === today.getFullYear()
                    && month.month === today.getMonth()
                    && day === today.getDate();
                  const dayEvts = eventsForDay(day);
                  const visible = dayEvts.slice(0, 3);
                  const overflow = dayEvts.length - 3;

                  return (
                    <div
                      key={di}
                      style={s.dayCell(isToday, day === null, canEdit)}
                      onClick={() => {
                        if (day && canEdit) {
                          setEventModal({ mode: 'create', day: dayKey(month.year, month.month, day) });
                        }
                      }}
                    >
                      {day && <div style={s.dayNum(isToday)}>{day}</div>}
                      {visible.map(evt => (
                        <button
                          key={evt.id}
                          style={s.eventPill(evt.color || selectedCal?.color || '#3B82F6')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEventModal({ mode: 'edit', event: evt });
                          }}
                          title={evt.title}
                        >
                          {!evt.all_day && <span style={{ opacity: 0.7 }}>{fmtTime(evt.start_at)} </span>}
                          {evt.title}
                        </button>
                      ))}
                      {overflow > 0 && <div style={s.moreEvents}>+{overflow} autre{overflow > 1 ? 's' : ''}</div>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showCalForm && (
        <CalendarFormModal onSave={handleCreateCal} onClose={() => setShowCalForm(false)} />
      )}
      {editCal && (
        <CalendarFormModal initial={editCal} onSave={handleUpdateCal} onClose={() => setEditCal(null)} />
      )}
      {shareCalId && (() => {
        const shareCal = calendars.find(c => c.id === shareCalId);
        return shareCal ? (
          <ShareModal cal={shareCal} onClose={() => setShareCalId(null)} />
        ) : null;
      })()}
      {eventModal?.mode === 'create' && (
        <EventFormModal
          defaultDay={eventModal.day}
          onSave={handleCreateEvent}
          onClose={() => setEventModal(null)}
        />
      )}
      {eventModal?.mode === 'edit' && (
        <EventFormModal
          initial={eventModal.event}
          onSave={handleUpdateEvent}
          onDelete={handleDeleteEvent}
          onClose={() => setEventModal(null)}
        />
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
