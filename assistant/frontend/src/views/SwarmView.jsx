import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const STATUSES = ['backlog', 'ready', 'running', 'review', 'done'];

const COL_STATUSES = {
  backlog:  ['backlog'],
  ready:    ['ready'],
  running:  ['running'],
  review:   ['review', 'error'],
  done:     ['done', 'cancelled'],
};

const STATUS_DOT = {
  backlog:   '#6b6b6b',
  ready:     '#3b82f6',
  running:   '#f59e0b',
  review:    '#7c3aed',
  done:      '#10b981',
  error:     '#ef4444',
  cancelled: '#444',
};

const ROLE_COLOR = {
  builder:    '#3b82f6',
  researcher: '#06b6d4',
  ops:        '#f97316',
  qa:         '#ef4444',
  writer:     '#10b981',
};

const ROLE_ICON = { builder: '🏗', researcher: '🔍', ops: '⚙', qa: '🧪', writer: '✍' };

function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d;
  if (diff < 60000) return 'à l\'instant';
  if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return 'aujourd\'hui';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onCancel, onDone, onLog }) {
  const { t } = useTranslation();
  const isRunning   = task.status === 'running';
  const isReview    = task.status === 'review';
  const isError     = task.status === 'error';
  const canCancel   = ['backlog', 'ready', 'running'].includes(task.status);
  const hasLog      = task.log && task.log.trim().length > 0;
  const roleColor   = ROLE_COLOR[task.role] || '#6b6b6b';
  const dotColor    = STATUS_DOT[task.status] || '#6b6b6b';

  return (
    <div style={{
      background: isError ? '#1a0a0a' : '#1a1a1a',
      border: `1px solid ${isError ? '#ef444433' : isReview ? '#7c3aed33' : '#2a2a2a'}`,
      borderRadius: '8px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      flexShrink: 0,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{
          background: roleColor + '22',
          color: roleColor,
          borderRadius: '4px',
          padding: '2px 6px',
          fontSize: '11px',
          fontWeight: 600,
          flexShrink: 0,
          marginTop: '1px',
        }}>
          {ROLE_ICON[task.role]} {task.role}
        </span>
        <span style={{ fontSize: '13px', color: '#e5e5e5', fontWeight: 500, lineHeight: 1.4, flex: 1 }}>
          {task.title}
        </span>
      </div>

      {/* Status / time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
          boxShadow: isRunning ? `0 0 6px ${dotColor}` : 'none',
        }} />
        {isRunning && (
          <span style={{ fontSize: '11px', color: '#f59e0b', animation: 'pulse 1.5s infinite' }}>
            {t('swarm.agentRunning')}
          </span>
        )}
        {!isRunning && (
          <span style={{ fontSize: '11px', color: '#555' }}>{relTime(task.created_at)}</span>
        )}
      </div>

      {/* Actions */}
      {(canCancel || isReview || isError || hasLog) && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {isReview && (
            <button
              onClick={() => onDone(task.id)}
              style={{
                padding: '4px 10px', fontSize: '11px', borderRadius: '5px',
                background: '#10b98122', border: '1px solid #10b98144',
                color: '#10b981', cursor: 'pointer',
              }}
            >
              {t('swarm.approve')}
            </button>
          )}
          {hasLog && (
            <button
              onClick={() => onLog(task)}
              style={{
                padding: '4px 10px', fontSize: '11px', borderRadius: '5px',
                background: '#7c3aed22', border: '1px solid #7c3aed44',
                color: '#a78bfa', cursor: 'pointer',
              }}
            >
              {t('swarm.log')}
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => onCancel(task.id)}
              style={{
                padding: '4px 10px', fontSize: '11px', borderRadius: '5px',
                background: 'transparent', border: '1px solid #333',
                color: '#6b6b6b', cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({ colKey, label, tasks, onCancel, onDone, onLog }) {
  const count = tasks.length;
  return (
    <div style={{
      width: '220px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      background: '#111',
      borderRadius: '10px',
      padding: '12px',
      maxHeight: '100%',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexShrink: 0 }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        {count > 0 && (
          <span style={{
            background: '#222', color: '#6b6b6b', borderRadius: '10px',
            padding: '1px 7px', fontSize: '11px',
          }}>
            {count}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
        {tasks.map(t => (
          <TaskCard key={t.id} task={t} onCancel={onCancel} onDone={onDone} onLog={onLog} />
        ))}
        {count === 0 && (
          <div style={{ color: '#333', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>
            —
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreateForm({ onClose, onCreate }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('builder');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !instructions.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/swarm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, role, instructions }),
      });
      if (!res.ok) throw new Error('Erreur création');
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    background: '#111',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#e5e5e5',
    fontSize: '13px',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div style={{
      borderBottom: '1px solid #222',
      padding: '16px 20px',
      background: '#131313',
    }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('swarm.taskTitle')}
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{ ...inputStyle, width: '140px', flex: 'none', cursor: 'pointer' }}
          >
            <option value="builder">🏗 Builder</option>
            <option value="researcher">🔍 Researcher</option>
            <option value="ops">⚙ Ops</option>
            <option value="qa">🧪 QA</option>
            <option value="writer">✍ Writer</option>
          </select>
        </div>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder={t('swarm.instructions')}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px', fontSize: '12px', borderRadius: '6px',
              background: 'transparent', border: '1px solid #333', color: '#6b6b6b', cursor: 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={loading || !title.trim() || !instructions.trim()}
            style={{
              padding: '7px 16px', fontSize: '12px', borderRadius: '6px',
              background: '#7c3aed', border: 'none', color: '#fff',
              cursor: loading ? 'wait' : 'pointer',
              opacity: (!title.trim() || !instructions.trim()) ? 0.5 : 1,
            }}
          >
            {loading ? t('swarm.creating') : t('swarm.launch')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Log modal ─────────────────────────────────────────────────────────────────

function LogModal({ task, onClose }) {
  const { t } = useTranslation();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: '#000a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1a1a', border: '1px solid #2a2a2a',
          borderRadius: '12px', width: '680px', maxWidth: '90vw',
          maxHeight: '70vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid #222',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#e5e5e5' }}>
            {ROLE_ICON[task.role]} {task.title}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#6b6b6b', cursor: 'pointer', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>
        <div style={{
          padding: '16px', overflowY: 'auto', flex: 1,
          fontSize: '13px', color: '#c9d1d9', lineHeight: 1.6,
          whiteSpace: 'pre-wrap', fontFamily: 'monospace',
        }}>
          {task.log || t('swarm.noLog')}
        </div>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function SwarmView() {
  const { t } = useTranslation();
  const COL_LABEL = {
    backlog: t('swarm.backlog'),
    ready: t('swarm.ready'),
    running: t('swarm.inProgress'),
    review: t('swarm.review'),
    done: t('swarm.done'),
  };
  const [tasks, setTasks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [logTask, setLogTask] = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    const es = new EventSource('/api/swarm/events');
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === 'init') {
          setTasks(event.tasks);
        } else if (event.type === 'task_update') {
          setTasks(prev => {
            const idx = prev.findIndex(t => t.id === event.task.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = event.task;
              return next;
            }
            return [event.task, ...prev];
          });
        }
      } catch { /* ignore parse errors */ }
    };

    return () => es.close();
  }, []);

  async function handleCancel(taskId) {
    await fetch(`/api/swarm/tasks/${taskId}`, { method: 'DELETE' });
  }

  async function handleDone(taskId) {
    await fetch(`/api/swarm/tasks/${taskId}/done`, { method: 'PATCH' });
  }

  const byCol = {};
  for (const s of STATUSES) byCol[s] = [];
  for (const t of tasks) {
    for (const [col, statuses] of Object.entries(COL_STATUSES)) {
      if (statuses.includes(t.status)) { byCol[col].push(t); break; }
    }
  }

  const runningCount = tasks.filter(t => t.status === 'running').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f0f0f', overflow: 'hidden' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid #222',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#e5e5e5' }}>{t('swarm.title')}</span>
          {runningCount > 0 && (
            <span style={{
              fontSize: '11px', color: '#f59e0b',
              background: '#f59e0b11', border: '1px solid #f59e0b33',
              borderRadius: '10px', padding: '2px 8px',
              animation: 'pulse 1.5s infinite',
            }}>
              {runningCount} {runningCount > 1 ? t('swarm.activeMany') : t('swarm.activeOne')}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            padding: '7px 14px', fontSize: '12px', borderRadius: '7px',
            background: showForm ? '#2a1a4a' : '#7c3aed', border: 'none',
            color: '#fff', cursor: 'pointer', fontWeight: 500,
          }}
        >
          {showForm ? t('swarm.close') : t('swarm.newTask')}
        </button>
      </div>

      {/* Create form */}
      {showForm && <CreateForm onClose={() => setShowForm(false)} />}

      {/* Kanban board */}
      <div style={{
        display: 'flex', flex: 1, overflowX: 'auto', overflowY: 'hidden',
        padding: '16px', gap: '12px', alignItems: 'stretch',
      }}>
        {STATUSES.map(s => (
          <KanbanColumn
            key={s}
            colKey={s}
            label={COL_LABEL[s]}
            tasks={byCol[s]}
            onCancel={handleCancel}
            onDone={handleDone}
            onLog={setLogTask}
          />
        ))}
      </div>

      {/* Log modal */}
      {logTask && <LogModal task={logTask} onClose={() => setLogTask(null)} />}
    </div>
  );
}
