import { useState, useEffect } from 'react'
import { api } from '../services/api.js'

const STATUTS = { planifie: '📅 Planifié', en_cours: '🔴 En cours', termine: '✅ Terminé', annule: '❌ Annulé' }
const STATUT_COLORS = { planifie: '#4A90D9', en_cours: '#F04747', termine: '#43B581', annule: '#72767d' }

export default function ConseilPanel({ world, moi, onFermer, onOuvrirVotes }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(null)
  const [pvUploading, setPvUploading] = useState(null)
  const [aiResume, setAiResume] = useState({}) // conseil_id → texte
  const [aiChargement, setAiChargement] = useState(null)
  const isAdmin = world?.owner_id === moi?.id

  useEffect(() => { charger() }, [world?.id])

  async function charger() {
    const data = await api.get(`/conseils/world/${world.id}`)
    if (data) setItems(data)
  }

  async function sauvegarder(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = {
      world_id: world.id,
      date_conseil: fd.get('date_conseil'),
      heure: fd.get('heure'),
      lieu: fd.get('lieu'),
      ordre_du_jour: fd.get('ordre_du_jour'),
    }
    const result = form?.id ? await api.patch(`/conseils/${form.id}`, body) : await api.post('/conseils/', body)
    if (result) { setForm(null); charger() }
  }

  async function changerStatut(c, statut) {
    await api.patch(`/conseils/${c.id}`, { statut })
    charger()
  }

  async function supprimer(c) {
    if (!confirm('Supprimer cette séance ?')) return
    await api.del(`/conseils/${c.id}`)
    charger()
  }

  async function resumerAvecIA(c) {
    setAiChargement(c.id)
    const d = await api.post('/ai/summarize-conseil', { conseil_id: c.id, world_id: world.id })
    setAiChargement(null)
    if (d?.resume) setAiResume(prev => ({ ...prev, [c.id]: d.resume }))
  }

  async function uploadPv(c, file) {
    setPvUploading(c.id)
    const fd = new FormData(); fd.append('file', file)
    await api.upload(`/conseils/${c.id}/pv`, fd)
    setPvUploading(null); charger()
  }

  const now = new Date().toISOString().split('T')[0]
  const prochain = items.find(c => c.statut === 'planifie' && c.date_conseil >= now)

  return (
    <div className="mairie-panel">
      <div className="mairie-panel-header">
        <div className="mairie-panel-title"><span>🏛</span><h2>Conseil municipal</h2></div>
        <div className="mairie-panel-actions">
          {isAdmin && <button className="mairie-btn-primary" onClick={() => setForm({})}>＋ Planifier une séance</button>}
          <button className="mairie-btn-close" onClick={onFermer}>✕</button>
        </div>
      </div>

      {prochain && (
        <div className="mairie-prochain-conseil">
          <span>🔔</span>
          <strong>Prochain conseil :</strong> {prochain.date_conseil} à {prochain.heure} — {prochain.lieu}
        </div>
      )}

      <div className="mairie-list">
        {items.length === 0 && <div className="mairie-empty">Aucune séance planifiée</div>}
        {[...items].reverse().map(c => (
          <div key={c.id} className="mairie-card">
            <div className="mairie-card-header">
              <span style={{ color: STATUT_COLORS[c.statut], fontWeight: 600 }}>{STATUTS[c.statut] || c.statut}</span>
              <span className="mairie-card-meta-inline">📅 {c.date_conseil} à {c.heure}</span>
            </div>
            <div className="mairie-card-titre">📍 {c.lieu}</div>
            {c.ordre_du_jour && (
              <div className="mairie-card-odj">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Ordre du jour :</strong>
                  <button
                    onClick={() => resumerAvecIA(c)}
                    disabled={aiChargement === c.id}
                    style={{ fontSize: 11, padding: '2px 8px', background: '#5865F2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    title="Résumer avec l'IA"
                  >
                    {aiChargement === c.id ? '⏳' : '🤖 Résumer'}
                  </button>
                </div>
                <pre>{c.ordre_du_jour}</pre>
                {aiResume[c.id] && (
                  <div style={{ marginTop: 8, padding: 10, background: '#1e2124', borderRadius: 6, borderLeft: '3px solid #5865F2', fontSize: 12, color: '#dcddde', lineHeight: 1.5 }}>
                    <strong style={{ color: '#5865F2' }}>🤖 Résumé IA :</strong>
                    <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{aiResume[c.id]}</div>
                  </div>
                )}
              </div>
            )}
            <div className="mairie-card-footer">
              {c.has_pv ? (
                <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/conseils/${c.id}/pv`} target="_blank" rel="noopener noreferrer" className="mairie-btn-pdf">📄 Voir PV</a>
              ) : isAdmin && c.statut === 'termine' && (
                <label className="mairie-btn-pdf-upload">
                  {pvUploading === c.id ? '⏳ Upload...' : '📎 Joindre PV'}
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => uploadPv(c, e.target.files[0])} />
                </label>
              )}
              {c.statut === 'en_cours' && (
                <button
                  className="mairie-btn-primary"
                  onClick={() => onOuvrirVotes?.(c)}
                  style={{ fontSize: 12 }}
                >
                  🗳️ Votes
                </button>
              )}
              {isAdmin && (
                <div className="mairie-card-admin-btns">
                  <select value={c.statut} onChange={e => changerStatut(c, e.target.value)} style={{ fontSize: '12px', padding: '2px 6px', background: '#2b2d31', color: '#dcddde', border: '1px solid #4e5058', borderRadius: '4px' }}>
                    {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button onClick={() => setForm(c)}>✎</button>
                  <button onClick={() => supprimer(c)}>🗑</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {form !== null && (
        <div className="mairie-modal-overlay">
          <div className="mairie-modal">
            <h3>{form.id ? 'Modifier la séance' : 'Planifier une séance'}</h3>
            <form onSubmit={sauvegarder}>
              <label>Date <input name="date_conseil" type="date" defaultValue={form.date_conseil || ''} required /></label>
              <label>Heure <input name="heure" type="time" defaultValue={form.heure || '18:00'} /></label>
              <label>Lieu <input name="lieu" defaultValue={form.lieu || 'Salle du conseil'} /></label>
              <label>Ordre du jour
                <textarea name="ordre_du_jour" defaultValue={form.ordre_du_jour || ''} rows={6} placeholder="1. Approbation du PV&#10;2. Délibérations..." />
              </label>
              <div className="mairie-modal-btns">
                <button type="submit" className="mairie-btn-primary">Sauvegarder</button>
                <button type="button" onClick={() => setForm(null)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
