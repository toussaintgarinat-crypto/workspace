import { useState, useEffect } from 'react'
import { api } from '../services/api.js'

const ACTION_ICONS = {
  create_deliberation: '📜', update_deliberation: '✏️', delete_deliberation: '🗑',
  create_arrete: '📑', update_arrete: '✏️', delete_arrete: '🗑',
}

export default function AuditPanel({ world, moi, onFermer }) {
  const [logs, setLogs] = useState([])

  useEffect(() => { charger() }, [world?.id])

  async function charger() {
    const data = await api.get(`/audit/world/${world.id}?limit=200`)
    if (data) setLogs(data)
  }

  return (
    <div className="mairie-panel">
      <div className="mairie-panel-header">
        <div className="mairie-panel-title"><span>🔍</span><h2>Journal d'audit</h2></div>
        <div className="mairie-panel-actions">
          <button className="mairie-btn-close" onClick={onFermer}>✕</button>
        </div>
      </div>

      <div className="mairie-audit-list">
        {logs.length === 0 && <div className="mairie-empty">Aucun événement enregistré</div>}
        {logs.map(l => (
          <div key={l.id} className="mairie-audit-row">
            <span className="mairie-audit-icon">{ACTION_ICONS[l.action] || '📋'}</span>
            <div className="mairie-audit-content">
              <span className="mairie-audit-action">{l.action}</span>
              {l.details && <span className="mairie-audit-details"> — {l.details}</span>}
              <div className="mairie-audit-meta">
                <span>👤 {l.user_nom || '?'}</span>
                {l.ip && <span>🌐 {l.ip}</span>}
                <span>📅 {l.created_at?.replace('T', ' ').split('.')[0]}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
