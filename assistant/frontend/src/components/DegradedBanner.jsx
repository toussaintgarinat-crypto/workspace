import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || '/api';
const POLL_INTERVAL = 30_000;

export default function DegradedBanner() {
  const [components, setComponents] = useState({});
  const [open, setOpen] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/degraded`);
      if (!res.ok) return;
      const data = await res.json();
      setComponents(data.components ?? {});
    } catch {
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchState]);

  const degradedList = Object.entries(components).filter(([, v]) => v.degraded);
  if (degradedList.length === 0) return null;

  return (
    <div style={{
      background: '#92400e',
      color: '#fef3c7',
      padding: '6px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '13px',
      borderBottom: '1px solid #78350f',
      flexShrink: 0,
    }}>
      <span>⚠</span>
      <span style={{ flex: 1 }}>
        Mode dégradé actif —{' '}
        {degradedList.map(([k]) => k).join(', ')} indisponible(s)
      </span>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none',
          border: '1px solid #fef3c7',
          borderRadius: '4px',
          color: '#fef3c7',
          cursor: 'pointer',
          padding: '2px 8px',
          fontSize: '12px',
        }}
      >
        {open ? 'Masquer' : 'Détails'}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#78350f',
          padding: '12px 16px',
          zIndex: 1000,
          borderBottom: '1px solid #92400e',
        }}>
          {degradedList.map(([comp]) => (
            <div key={comp} style={{ marginBottom: '4px' }}>
              <span style={{ marginRight: '8px' }}>▸</span>
              <strong>{comp}</strong> — dégradé
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
