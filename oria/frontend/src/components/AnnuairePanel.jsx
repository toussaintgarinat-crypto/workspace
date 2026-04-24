import { useState, useEffect } from 'react'
import { api } from '../services/api.js'

const TYPES = { agent: '👷 Agent', elu: '🏛 Élu', stagiaire: '🎓 Stagiaire', externe: '🔗 Externe' }
const TYPE_COLORS = { agent: '#4A90D9', elu: '#E67E22', stagiaire: '#8E44AD', externe: '#16A085' }

export default function AnnuairePanel({ world, moi, onFermer }) {
  const [items, setItems] = useState([])
  const [filtre, setFiltre] = useState('')
  const [form, setForm] = useState(null)
  const [vue, setVue] = useState('liste') // 'liste' | 'organigramme'
  const [importLoading, setImportLoading] = useState(false)
  const isAdmin = world?.owner_id === moi?.id

  useEffect(() => { charger() }, [world?.id, filtre])

  async function charger() {
    const path = `/annuaire/world/${world.id}${filtre ? `?type_poste=${filtre}` : ''}`
    const data = await api.get(path)
    if (data) setItems(data)
  }

  async function sauvegarder(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = {
      world_id: world.id,
      nom: fd.get('nom'),
      prenom: fd.get('prenom'),
      type_poste: fd.get('type_poste'),
      service: fd.get('service'),
      fonction: fd.get('fonction'),
      telephone: fd.get('telephone'),
      email_pro: fd.get('email_pro'),
      bureau: fd.get('bureau'),
    }
    const result = form?.id ? await api.patch(`/annuaire/${form.id}`, body) : await api.post('/annuaire/', body)
    if (result) { setForm(null); charger() }
  }

  async function importerCSV(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportLoading(true)
    const fd = new FormData(); fd.append('file', file)
    const result = await api.upload(`/annuaire/import?world_id=${world.id}`, fd)
    setImportLoading(false)
    if (result) { charger() }
    e.target.value = ''
  }

  async function desactiver(a) {
    if (!confirm(`Désactiver ${a.prenom} ${a.nom} ?`)) return
    await api.del(`/annuaire/${a.id}`)
    charger()
  }

  return (
    <div className="mairie-panel">
      <div className="mairie-panel-header">
        <div className="mairie-panel-title"><span>👥</span><h2>Annuaire agents & élus</h2></div>
        <div className="mairie-panel-actions">
          <button className={`mairie-filter-btn ${vue === 'organigramme' ? 'actif' : ''}`} onClick={() => setVue(v => v === 'organigramme' ? 'liste' : 'organigramme')}>
            🌳 Organigramme
          </button>
          {isAdmin && (
            <label className="mairie-btn-pdf-upload" title="Importer CSV (nom,prenom,type_poste,service,fonction,telephone,email_pro,bureau)">
              {importLoading ? '⏳' : '📥 Import CSV'}
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={importerCSV} />
            </label>
          )}
          {isAdmin && <button className="mairie-btn-primary" onClick={() => setForm({})}>＋ Ajouter</button>}
          <button className="mairie-btn-close" onClick={onFermer}>✕</button>
        </div>
      </div>

      <div className="mairie-filters">
        <button className={`mairie-filter-btn ${!filtre ? 'actif' : ''}`} onClick={() => setFiltre('')}>Tous</button>
        {Object.entries(TYPES).map(([k, v]) => (
          <button key={k} className={`mairie-filter-btn ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>{v}</button>
        ))}
      </div>

      {vue === 'organigramme' && (() => {
        const parService = {}
        items.forEach(a => {
          const svc = a.service || '— (sans service)'
          if (!parService[svc]) parService[svc] = []
          parService[svc].push(a)
        })
        return (
          <div className="mairie-organigramme">
            {Object.entries(parService).map(([svc, agents]) => (
              <div key={svc} className="mairie-org-service">
                <div className="mairie-org-service-header">
                  <span>🏢</span> {svc}
                  <span className="mairie-org-count">{agents.length}</span>
                </div>
                <div className="mairie-org-agents">
                  {agents.map(a => (
                    <div key={a.id} className="mairie-org-agent">
                      <div className="mairie-org-agent-avatar" style={{ background: TYPE_COLORS[a.type_poste] || '#4e5058' }}>
                        {a.prenom[0]}{a.nom[0]}
                      </div>
                      <div>
                        <div className="mairie-org-agent-nom">{a.prenom} {a.nom}</div>
                        <div className="mairie-org-agent-fn">{a.fonction || TYPES[a.type_poste]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      <div className="mairie-annuaire-grid" style={{ display: vue === 'organigramme' ? 'none' : undefined }}>
        {items.length === 0 && <div className="mairie-empty">Annuaire vide</div>}
        {items.map(a => (
          <div key={a.id} className="mairie-agent-card">
            <div className="mairie-agent-avatar" style={{ background: TYPE_COLORS[a.type_poste] || '#4e5058' }}>
              {a.prenom[0]}{a.nom[0]}
            </div>
            <div className="mairie-agent-info">
              <div className="mairie-agent-nom">{a.prenom} {a.nom}</div>
              <div className="mairie-agent-fonction">{a.fonction || a.type_poste}</div>
              {a.service && <div className="mairie-agent-service">🏢 {a.service}</div>}
              {a.telephone && <div className="mairie-agent-contact">📞 {a.telephone}</div>}
              {a.email_pro && <div className="mairie-agent-contact">✉ {a.email_pro}</div>}
              {a.bureau && <div className="mairie-agent-contact">📍 {a.bureau}</div>}
            </div>
            <div className="mairie-agent-type-badge" style={{ color: TYPE_COLORS[a.type_poste] }}>
              {TYPES[a.type_poste] || a.type_poste}
            </div>
            {isAdmin && (
              <div className="mairie-card-admin-btns mairie-agent-btns">
                <button onClick={() => setForm(a)}>✎</button>
                <button onClick={() => desactiver(a)}>🗑</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {form !== null && (
        <div className="mairie-modal-overlay">
          <div className="mairie-modal">
            <h3>{form.id ? 'Modifier la fiche' : 'Nouvelle fiche agent/élu'}</h3>
            <form onSubmit={sauvegarder}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label>Prénom <input name="prenom" defaultValue={form.prenom || ''} required /></label>
                <label>Nom <input name="nom" defaultValue={form.nom || ''} required /></label>
              </div>
              <label>Type
                <select name="type_poste" defaultValue={form.type_poste || 'agent'}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>Service / Direction <input name="service" defaultValue={form.service || ''} /></label>
              <label>Fonction <input name="fonction" defaultValue={form.fonction || ''} /></label>
              <label>Téléphone <input name="telephone" defaultValue={form.telephone || ''} /></label>
              <label>Email pro <input name="email_pro" type="email" defaultValue={form.email_pro || ''} /></label>
              <label>Bureau <input name="bureau" defaultValue={form.bureau || ''} /></label>
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
