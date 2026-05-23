import { useState, useEffect, useCallback } from 'react';
import api from '../services/api.js';

const POLL_INTERVAL = 30_000;

export default function DegradedBanner() {
  const [components, setComponents] = useState({});
  const [open, setOpen] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/degraded');
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
      position: 'relative',
      zIndex: 100,
    }}>
      <span>⚠</span>
      <span style={{ flex: 1 }}>
        Mode dégradé —{' '}
        {degradedList.map(([k]) => k).join(', ')} indisponible(s)
        {components.readonly?.degraded && ' — lecture seule activée'}
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
        {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#78350f',
          padding: '12px 16px',
          zIndex: 200,
          borderBottom: '2px solid #92400e',
        }}>
          {degradedList.map(([comp]) => (
            <div key={comp} style={{ marginBottom: '4px' }}>
              <span style={{ marginRight: '8px' }}>▸</span>
              <strong>{comp}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
