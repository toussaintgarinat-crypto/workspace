import { useState, useEffect } from 'react'
import { token } from '../../../services/api'
import styles from './Panel.module.css'

const BASE = ''
async function req(path, opts = {}) {
  const t = token.get()
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...opts.headers }
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur')
  return res.json()
}

const STATUT_COLORS = { brouillon: '#6b7280', actif: '#f59e0b', termine: '#10b981' }
const STATUT_LABELS = { brouillon: 'Brouillon', actif: 'Actif', termine: 'Terminé' }

export default function AuditPanel({ poleId }) {
  const [missions, setMissions]   = useState([])
  const [selected, setSelected]   = useState(null)
  const [docs, setDocs]           = useState([])
  const [form, setForm]           = useState({ titre: '', description: '' })
  const [showForm, setShow]       = useState(false)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    req(`/api/poles/${poleId}/audit`).then(data => {
      setMissions(data)
      if (data.length > 0 && !selected) setSelected(data[0].id)
    }).catch(() => {})
  }, [poleId])

  useEffect(() => {
    if (!selected) return
    req(`/api/audit/${selected}/documents`).then(setDocs).catch(() => {})
  }, [selected])

  async function createMission(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const m = await req(`/api/poles/${poleId}/audit`, { method: 'POST', body: JSON.stringify(form) })
      setMissions(prev => [m, ...prev])
      setSelected(m.id)
      setForm({ titre: '', description: '' })
      setShow(false)
    } finally { setLoading(false) }
  }

  async function updateStatut(id, statut) {
    const updated = await req(`/api/audit/${id}`, { method: 'PATCH', body: JSON.stringify({ statut }) })
    setMissions(prev => prev.map(m => m.id === id ? updated : m))
  }

  async function deleteMission(id) {
    await req(`/api/audit/${id}`, { method: 'DELETE' })
    setMissions(prev => prev.filter(m => m.id !== id))
    if (selected === id) setSelected(null)
  }

  async function removePole(missionId, poleId) {
    await req(`/api/audit/${missionId}/poles/${poleId}`, { method: 'DELETE' })
    setMissions(prev => prev.map(m =>
      m.id === missionId ? { ...m, poles: m.poles.filter(p => p.id !== poleId) } : m
    ))
  }

  async function deleteDoc(id) {
    await req(`/api/audit/documents/${id}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  const currentMission = missions.find(m => m.id === selected)

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <select className={styles.select} value={selected || ''} onChange={e => setSelected(e.target.value)}>
          {missions.length === 0 && <option value="">Aucune mission</option>}
          {missions.map(m => <option key={m.id} value={m.id}>{m.titre}</option>)}
        </select>
        <button className={styles.btnPrimary} onClick={() => setShow(true)}>+ Mission</button>
      </div>

      {showForm && (
        <form className={styles.form} onSubmit={createMission}>
          <input className={styles.input} placeholder="Titre de la mission *" required value={form.titre}
            onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} />
          <textarea className={styles.textarea} placeholder="Description" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>Créer</button>
            <button type="button" className={styles.btnGhost} onClick={() => setShow(false)}>Annuler</button>
          </div>
        </form>
      )}

      {currentMission && (
        <div className={styles.missionDetail}>
          <div className={styles.missionHeader}>
            <div>
              <h3 className={styles.missionTitle}>{currentMission.titre}</h3>
              {currentMission.description && <p className={styles.missionDesc}>{currentMission.description}</p>}
            </div>
            <div className={styles.missionActions}>
              <span className={styles.statutBadge}
                style={{ background: STATUT_COLORS[currentMission.statut] + '22', color: STATUT_COLORS[currentMission.statut] }}>
                {STATUT_LABELS[currentMission.statut]}
              </span>
              {currentMission.statut === 'brouillon' && (
                <button className={styles.btnSecondary} onClick={() => updateStatut(currentMission.id, 'actif')}>Activer</button>
              )}
              {currentMission.statut === 'actif' && (
                <button className={styles.btnSecondary} onClick={() => updateStatut(currentMission.id, 'termine')}>Terminer</button>
              )}
              <button className={styles.micro} style={{ color: '#ef4444' }} onClick={() => deleteMission(currentMission.id)}>✕</button>
            </div>
          </div>

          {currentMission.poles?.length > 0 && (
            <div className={styles.polesSection}>
              <h4 className={styles.docsTitle}>Pôles couverts ({currentMission.poles.length})</h4>
              <div className={styles.polesTags}>
                {currentMission.poles.map(p => (
                  <span key={p.id} className={styles.poleTag} style={{ borderColor: p.couleur }}>
                    {p.emoji} {p.nom}
                    <button
                      className={styles.poleTagRemove}
                      onClick={() => removePole(currentMission.id, p.id)}
                      title="Retirer ce pôle"
                    >✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={styles.docsSection}>
            <h4 className={styles.docsTitle}>Documents ({docs.length})</h4>
            {docs.length === 0 && <p className={styles.empty}>Aucun document. Uploadez via le workspace.</p>}
            {docs.map(doc => (
              <div key={doc.id} className={styles.docCard}>
                <div className={styles.rowTitle}>📄 {doc.nom}</div>
                {doc.analyse && <div className={styles.analyse}>{doc.analyse.slice(0, 200)}…</div>}
                <button className={styles.micro} style={{ color: '#ef4444' }} onClick={() => deleteDoc(doc.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {missions.length === 0 && !showForm && (
        <p className={styles.empty}>Crée une mission d'audit pour commencer.</p>
      )}
    </div>
  )
}
