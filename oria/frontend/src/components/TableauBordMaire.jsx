import { useState, useEffect } from 'react'
import { api } from '../services/api.js'

export default function TableauBordMaire({ world, moi, onFermer }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { charger() }, [world?.id])

  async function charger() {
    setLoading(true)
    const data = await api.get(`/tableau-bord/world/${world.id}`)
    setStats(data)
    setLoading(false)
  }

  if (loading) return (
    <div className="mairie-panel"><div className="mairie-empty">Chargement...</div></div>
  )

  if (!stats) return (
    <div className="mairie-panel">
      <div className="mairie-panel-header">
        <div className="mairie-panel-title"><span>📊</span><h2>Tableau de bord</h2></div>
        <div className="mairie-panel-actions"><button className="mairie-btn-close" onClick={onFermer}>✕</button></div>
      </div>
      <div className="mairie-empty">Accès réservé aux administrateurs</div>
    </div>
  )

  return (
    <div className="mairie-panel">
      <div className="mairie-panel-header">
        <div className="mairie-panel-title"><span>📊</span><h2>Tableau de bord — {world.nom}</h2></div>
        <div className="mairie-panel-actions"><button className="mairie-btn-close" onClick={onFermer}>✕</button></div>
      </div>

      <div className="mairie-tableau-grid">
        <div className="mairie-kpi-card">
          <div className="mairie-kpi-value">{stats.nb_agents}</div>
          <div className="mairie-kpi-label">👷 Agents</div>
        </div>
        <div className="mairie-kpi-card">
          <div className="mairie-kpi-value">{stats.nb_elus}</div>
          <div className="mairie-kpi-label">🏛 Élus</div>
        </div>
        <div className="mairie-kpi-card">
          <div className="mairie-kpi-value">{stats.nb_membres_total}</div>
          <div className="mairie-kpi-label">👥 Membres Oria</div>
        </div>
        <div className="mairie-kpi-card">
          <div className="mairie-kpi-value">{stats.nb_services}</div>
          <div className="mairie-kpi-label">🏢 Services</div>
        </div>
      </div>

      <div className="mairie-tableau-section">
        <h3>📜 Délibérations</h3>
        <div className="mairie-tableau-delibs">
          {Object.entries(stats.deliberations_par_statut).map(([k, v]) => (
            <div key={k} className="mairie-delib-stat">
              <span className="mairie-delib-count">{v}</span>
              <span className="mairie-delib-label">{k}</span>
            </div>
          ))}
          <div className="mairie-delib-stat">
            <span className="mairie-delib-count">{stats.nb_deliberations_total}</span>
            <span className="mairie-delib-label">total</span>
          </div>
        </div>
      </div>

      <div className="mairie-tableau-section">
        <h3>📑 Arrêtés cette année</h3>
        <div className="mairie-kpi-inline">{stats.nb_arretes_annee} arrêtés</div>
      </div>

      <div className="mairie-tableau-section">
        <h3>🏛 Conseil municipal</h3>
        {stats.prochain_conseil ? (
          <div className="mairie-prochain-conseil">🔔 Prochain conseil : <strong>{stats.prochain_conseil}</strong></div>
        ) : (
          <div className="mairie-kpi-inline">Aucun conseil planifié</div>
        )}
        <div className="mairie-kpi-inline">{stats.nb_conseils_mois} séance(s) ce mois</div>
      </div>

      <div className="mairie-tableau-section">
        <h3>📮 Tickets citoyens en attente</h3>
        <div className="mairie-kpi-inline" style={{ color: stats.nb_tickets_nouveaux > 0 ? '#F04747' : '#43B581' }}>
          {stats.nb_tickets_nouveaux} nouveau(x)
        </div>
      </div>
    </div>
  )
}
