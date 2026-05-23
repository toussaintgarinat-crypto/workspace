import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL = 30_000;

function fetchDegraded(apiUrl) {
  return fetch(`${apiUrl}/admin/degraded`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('forge_token') || ''}` },
  })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
}

export default function DegradedBanner({ apiUrl = '' }) {
  const [components, setComponents] = useState({});
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetchDegraded(apiUrl);
    if (data) setComponents(data.components ?? {});
  }, [apiUrl]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  const degradedList = Object.entries(components).filter(([, v]) => v.degraded);
  if (degradedList.length === 0) return null;

  return (
    <div style={{
      background: '#92400e',
      color: '#fef3c7',
      padding: '6px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '13px',
      borderBottom: '1px solid #78350f',
      position: 'relative',
      zIndex: 500,
    }}>
      <span>⚠</span>
      <span style={{ flex: 1 }}>
        Mode dégradé — {degradedList.map(([k]) => k).join(', ')} indisponible(s)
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
        {open ? 'Fermer' : 'Détails'}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#78350f',
          padding: '12px 16px',
          zIndex: 600,
          borderBottom: '2px solid #92400e',
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
