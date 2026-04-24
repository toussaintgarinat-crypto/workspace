import { useState, useEffect } from 'react'
import { api } from '../services/api.js'

const TYPES = { municipal: '🏛 Municipal', prefectoral: '🏢 Préfectoral', delegue: '📋 Délégué' }

export default function ArretesPanel({ world, moi, onFermer }) {
  const [items, setItems] = useState([])
  const [filtre, setFiltre] = useState('')
  const [archive, setArchive] = useState(false)
  const [form, setForm] = useState(null)
  const [pdfUploading, setPdfUploading] = useState(null)
  const isAdmin = world?.owner_id === moi?.id

  useEffect(() => { charger() }, [world?.id, filtre, archive])

  async function charger() {
    const path = `/arretes/world/${world.id}?archive=${archive}${filtre ? `&type_arrete=${filtre}` : ''}`
    const data = await api.get(path)
    if (data) setItems(data)
  }

  async function changerWorkflow(id, statut) {
    await api.patch(`/arretes/${id}/workflow?statut_workflow=${statut}`, {})
    charger()
  }

  function imprimer(a) {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Arrêté ${a.numero}</title>
    <style>body{font-family:serif;max-width:700px;margin:40px auto;color:#000}
    h1{font-size:18px;text-align:center}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:20px 0;border:1px solid #ccc;padding:12px}
    .sign-line{border-top:1px solid #000;margin-top:60px;padding-top:8px;font-size:12px;text-align:center}</style></head>
    <body>
    <div style="text-align:center;font-size:12px">ARRÊTÉ ${a.type_arrete?.toUpperCase()}</div>
    <h1>Arrêté N° ${a.numero}</h1>
    <div class="meta">
      <div><strong>Date :</strong> ${a.date_arrete}</div>
      <div><strong>Type :</strong> ${a.type_arrete}</div>
    </div>
    <p><strong>Objet :</strong> ${a.objet || '—'}</p>
    <div class="sign-line">Le Maire</div>
    </body></html>`)
    w.document.close(); w.print()
  }

  async function sauvegarder(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = {
      world_id: world.id,
      numero: fd.get('numero'),
      type_arrete: fd.get('type_arrete'),
      date_arrete: fd.get('date_arrete'),
      objet: fd.get('objet'),
      confidentiel: fd.get('confidentiel') === 'on',
    }
    const result = form?.id ? await api.patch(`/arretes/${form.id}`, body) : await api.post('/arretes/', body)
    if (result) { setForm(null); charger() }
  }

  async function supprimer(a) {
    if (!confirm(`Supprimer l'arrêté « ${a.numero} » ?`)) return
    await api.del(`/arretes/${a.id}`)
    charger()
  }

  async function uploadPdf(a, file) {
    setPdfUploading(a.id)
    const fd = new FormData(); fd.append('file', file)
    await api.upload(`/arretes/${a.id}/pdf`, fd)
    setPdfUploading(null); charger()
  }

  return (
    <div className="mairie-panel">
      <div className="mairie-panel-header">
        <div className="mairie-panel-title"><span>📑</span><h2>Arrêtés municipaux</h2></div>
        <div className="mairie-panel-actions">
          {isAdmin && <button className="mairie-btn-primary" onClick={() => setForm({})}>＋ Nouvel arrêté</button>}
          <button className="mairie-btn-close" onClick={onFermer}>✕</button>
        </div>
      </div>

      <div className="mairie-filters">
        <button className={`mairie-filter-btn ${!filtre ? 'actif' : ''}`} onClick={() => setFiltre('')}>Tous</button>
        {Object.entries(TYPES).map(([k, v]) => (
          <button key={k} className={`mairie-filter-btn ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>{v}</button>
        ))}
        <button className={`mairie-filter-btn ${archive ? 'actif' : ''}`} onClick={() => setArchive(v => !v)}>
          📦 Archives
        </button>
      </div>

      <div className="mairie-list">
        {items.length === 0 && <div className="mairie-empty">Aucun arrêté</div>}
        {items.map(a => (
          <div key={a.id} className="mairie-card">
            <div className="mairie-card-header">
              <span className="mairie-card-numero">{a.numero}</span>
              <span className="mairie-card-type">{TYPES[a.type_arrete] || a.type_arrete}</span>
              {a.confidentiel && <span className="mairie-badge-confidentiel">🔒 Confidentiel</span>}
              {a.workflow_statut && a.workflow_statut !== 'brouillon' && (
                <span className={`workflow-badge workflow-${a.workflow_statut}`}>
                  {a.workflow_statut === 'soumis' ? '📋 Soumis' : a.workflow_statut === 'signe' ? '✍️ Signé' : a.workflow_statut === 'publie' ? '✅ Publié' : a.workflow_statut === 'archive' ? '📦 Archivé' : a.workflow_statut}
                </span>
              )}
            </div>
            <div className="mairie-card-titre">{a.objet || '(sans objet)'}</div>
            <div className="mairie-card-meta"><span>📅 {a.date_arrete}</span></div>
            <div className="mairie-card-footer">
              {a.has_pdf ? (
                <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/arretes/${a.id}/pdf`} target="_blank" rel="noopener noreferrer" className="mairie-btn-pdf">📄 Voir PDF</a>
              ) : isAdmin && (
                <label className="mairie-btn-pdf-upload">
                  {pdfUploading === a.id ? '⏳ Upload...' : '📎 Joindre PDF'}
                  <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => uploadPdf(a, e.target.files[0])} />
                </label>
              )}
              <button className="mairie-btn-pdf" onClick={() => imprimer(a)} title="Modèle imprimable">🖨️</button>
              {isAdmin && (
                <div className="mairie-card-admin-btns">
                  {a.workflow_statut !== 'archive' && (
                    <select
                      value={a.workflow_statut || 'brouillon'}
                      onChange={e => changerWorkflow(a.id, e.target.value)}
                      className="workflow-select"
                    >
                      <option value="brouillon">Brouillon</option>
                      <option value="soumis">Soumis</option>
                      <option value="signe">Signé</option>
                      <option value="publie">Publié</option>
                      <option value="archive">Archiver</option>
                    </select>
                  )}
                  <button onClick={() => setForm(a)}>✎</button>
                  <button onClick={() => supprimer(a)}>🗑</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {form !== null && (
        <div className="mairie-modal-overlay">
          <div className="mairie-modal">
            <h3>{form.id ? 'Modifier l\'arrêté' : 'Nouvel arrêté'}</h3>
            <form onSubmit={sauvegarder}>
              <label>Numéro <input name="numero" defaultValue={form.numero || ''} required /></label>
              <label>Type
                <select name="type_arrete" defaultValue={form.type_arrete || 'municipal'}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>Date <input name="date_arrete" type="date" defaultValue={form.date_arrete || ''} required /></label>
              <label>Objet <textarea name="objet" defaultValue={form.objet || ''} rows={3} /></label>
              <label className="mairie-checkbox-label">
                <input name="confidentiel" type="checkbox" defaultChecked={form.confidentiel} />
                Confidentiel
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
