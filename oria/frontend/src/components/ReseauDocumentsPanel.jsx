import { useState, useEffect } from 'react'
import { api } from '../services/api.js'

const WORKFLOW_LABELS = {
  brouillon: { label: '📝 Brouillon', color: '#72767d' },
  soumis:    { label: '📨 Soumis',    color: '#FAA61A' },
  signe:     { label: '✍️ Signé',     color: '#4A90D9' },
  publie:    { label: '✅ Publié',    color: '#43B581' },
}

export default function ReseauDocumentsPanel({ world, moi, onFermer }) {
  const [data, setData] = useState(null)
  const [onglet, setOnglet] = useState('deliberations') // 'deliberations' | 'arretes'
  const [chargement, setChargement] = useState(true)

  useEffect(() => { charger() }, [world?.id])

  async function charger() {
    setChargement(true)
    const d = await api.get(`/reseau/documents?world_id=${world.id}`)
    setChargement(false)
    if (d) setData(d)
  }

  const items = onglet === 'deliberations' ? data?.deliberations || [] : data?.arretes || []

  return (
    <div className="mairie-panel">
      <div className="mairie-panel-header">
        <div className="mairie-panel-title"><span>🏘</span><h2>Documents intercommunaux</h2></div>
        <div className="mairie-panel-actions">
          <button className="mairie-btn-close" onClick={onFermer}>✕</button>
        </div>
      </div>

      {data && data.communes.length === 0 && (
        <div className="mairie-empty" style={{ padding: 40 }}>
          <p>Aucune commune liée au réseau intercommunal.</p>
          <p style={{ fontSize: 12, color: '#72767d', marginTop: 8 }}>
            Connectez des communes via la vue Intercommunalité.
          </p>
        </div>
      )}

      {data && data.communes.length > 0 && (
        <>
          <div style={{ padding: '10px 16px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#72767d', alignSelf: 'center' }}>Communes liées :</span>
            {data.communes.map(c => (
              <span key={c.id} style={{ fontSize: 12, background: '#2b2d31', borderRadius: 12, padding: '2px 10px', color: '#dcddde' }}>
                {c.emoji} {c.nom}
              </span>
            ))}
          </div>

          <div className="mairie-filters" style={{ marginTop: 10 }}>
            <button className={`mairie-filter-btn ${onglet === 'deliberations' ? 'actif' : ''}`}
              onClick={() => setOnglet('deliberations')}>📜 Délibérations ({data.deliberations.length})</button>
            <button className={`mairie-filter-btn ${onglet === 'arretes' ? 'actif' : ''}`}
              onClick={() => setOnglet('arretes')}>📑 Arrêtés ({data.arretes.length})</button>
          </div>

          <div className="mairie-list">
            {chargement && <div className="mairie-empty">Chargement…</div>}
            {!chargement && items.length === 0 && (
              <div className="mairie-empty">
                Aucun document partagé pour le moment.<br/>
                <span style={{ fontSize: 12, color: '#72767d' }}>
                  Les communes partenaires peuvent partager leurs documents depuis leurs panneaux respectifs.
                </span>
              </div>
            )}
            {items.map(doc => {
              const wf = WORKFLOW_LABELS[doc.workflow_statut] || { label: doc.workflow_statut, color: '#72767d' }
              return (
                <div key={doc.id} className="mairie-card">
                  <div className="mairie-card-header">
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {doc.commune?.emoji} {doc.commune?.nom}
                    </span>
                    <span style={{ color: wf.color, fontSize: 11 }}>{wf.label}</span>
                  </div>
                  <div className="mairie-card-titre">
                    {doc.numero && <span style={{ color: '#72767d', fontSize: 12, marginRight: 8 }}>{doc.numero}</span>}
                    {doc.titre || doc.objet}
                  </div>
                  <div className="mairie-card-meta">
                    <span>📅 {doc.date_seance || doc.date_arrete}</span>
                    {doc.statut && <span>{doc.statut}</span>}
                    {doc.type_arrete && <span>{doc.type_arrete}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
