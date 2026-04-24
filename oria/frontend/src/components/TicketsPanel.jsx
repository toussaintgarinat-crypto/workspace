import { useState, useEffect } from 'react'
import { api } from '../services/api.js'

const STATUTS = { nouveau: '🆕 Nouveau', en_traitement: '🔄 En traitement', resolu: '✅ Résolu', ferme: '🔒 Fermé' }
const STATUT_COLORS = { nouveau: '#F04747', en_traitement: '#FAA61A', resolu: '#43B581', ferme: '#72767d' }
const TYPES = { travaux: '🔨 Travaux', permis: '📋 Permis', nuisance: '⚠️ Nuisance', autre: '📝 Autre' }

export default function TicketsPanel({ world, moi, onFermer }) {
  const [items, setItems] = useState([])
  const [filtre, setFiltre] = useState('')
  const [detail, setDetail] = useState(null)
  const [reponse, setReponse] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [aiChargement, setAiChargement] = useState(false)

  useEffect(() => { charger() }, [world?.id, filtre])

  async function charger() {
    const path = `/tickets/world/${world.id}${filtre ? `?statut=${filtre}` : ''}`
    const data = await api.get(path)
    if (data) setItems(data)
  }

  async function mettreAJour(id, patch) {
    await api.patch(`/tickets/${id}`, patch)
    charger()
    if (detail?.id === id) setDetail(prev => ({ ...prev, ...patch }))
  }

  async function envoyerReponse(t) {
    if (!reponse.trim()) return
    await mettreAJour(t.id, { reponse, statut: 'resolu' })
    setReponse('')
    setAiSuggestion('')
    setDetail(null)
  }

  async function suggererAvecIA(t) {
    setAiChargement(true)
    const d = await api.post('/ai/suggest-ticket-response', { ticket_id: t.id, world_id: world.id })
    setAiChargement(false)
    if (d?.suggestion) {
      setAiSuggestion(d.suggestion)
      setReponse(d.suggestion)
    }
  }

  return (
    <div className="mairie-panel">
      <div className="mairie-panel-header">
        <div className="mairie-panel-title"><span>📮</span><h2>Tickets citoyens</h2></div>
        <div className="mairie-panel-actions">
          <button className="mairie-btn-close" onClick={onFermer}>✕</button>
        </div>
      </div>

      <div className="mairie-filters">
        <button className={`mairie-filter-btn ${!filtre ? 'actif' : ''}`} onClick={() => setFiltre('')}>Tous</button>
        {Object.entries(STATUTS).map(([k, v]) => (
          <button key={k} className={`mairie-filter-btn ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>{v}</button>
        ))}
      </div>

      <div className="mairie-list">
        {items.length === 0 && <div className="mairie-empty">Aucun ticket</div>}
        {items.map(t => (
          <div key={t.id} className="mairie-card mairie-ticket-card" onClick={() => setDetail(t)}>
            <div className="mairie-card-header">
              <span className="mairie-ticket-type">{TYPES[t.type_demande] || t.type_demande}</span>
              <span style={{ color: STATUT_COLORS[t.statut], fontWeight: 600, fontSize: '12px' }}>{STATUTS[t.statut] || t.statut}</span>
            </div>
            <div className="mairie-card-titre">{t.titre}</div>
            <div className="mairie-card-meta">
              <span>👤 {t.nom_citoyen}</span>
              <span>✉ {t.email_citoyen}</span>
              <span>📅 {t.created_at?.split('T')[0]}</span>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <div className="mairie-modal-overlay" onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div className="mairie-modal mairie-ticket-detail">
            <div className="mairie-modal-header">
              <h3>{detail.titre}</h3>
              <button onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="mairie-ticket-info">
              <p><strong>Citoyen :</strong> {detail.nom_citoyen} ({detail.email_citoyen})</p>
              <p><strong>Type :</strong> {TYPES[detail.type_demande] || detail.type_demande}</p>
              <p><strong>Date :</strong> {detail.created_at?.split('T')[0]}</p>
              {detail.description && <p><strong>Description :</strong> {detail.description}</p>}
            </div>
            <div className="mairie-ticket-statut-row">
              <label>Statut :
                <select value={detail.statut} onChange={e => mettreAJour(detail.id, { statut: e.target.value })}
                  style={{ marginLeft: '8px', background: '#2b2d31', color: '#dcddde', border: '1px solid #4e5058', borderRadius: '4px', padding: '4px 8px' }}>
                  {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            {detail.reponse && (
              <div className="mairie-ticket-reponse-existante">
                <strong>Réponse envoyée :</strong>
                <p>{detail.reponse}</p>
                <p style={{ fontSize: 12, color: '#72767d', marginTop: 4 }}>
                  📧 Une notification email est envoyée automatiquement au citoyen lors de la réponse.
                </p>
              </div>
            )}
            <div className="mairie-ticket-reponse-form">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#72767d' }}>Réponse</span>
                <button
                  type="button"
                  onClick={() => suggererAvecIA(detail)}
                  disabled={aiChargement}
                  style={{ fontSize: 11, padding: '2px 8px', background: '#5865F2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                >
                  {aiChargement ? '⏳' : '🤖 Suggestion IA'}
                </button>
              </div>
              <textarea value={reponse} onChange={e => setReponse(e.target.value)} placeholder="Répondre au citoyen..." rows={4} />
              <button className="mairie-btn-primary" onClick={() => envoyerReponse(detail)} disabled={!reponse.trim()}>
                Envoyer la réponse & marquer résolu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
