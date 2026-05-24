import { useState, useEffect, useRef } from 'react'
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

const STATUT_COLORS  = { brouillon: '#6b7280', actif: '#f59e0b', termine: '#10b981' }
const STATUT_LABELS  = { brouillon: 'Brouillon', actif: 'Actif', termine: 'Terminé' }
const SEV_COLORS     = { critique: '#ef4444', moyen: '#f59e0b', faible: '#6b7280' }
const PRIO_COLORS    = { haute: '#ef4444', moyenne: '#f59e0b', faible: '#10b981' }
const STATUT_R_ICONS = { ouvert: '○', en_cours: '◑', resolu: '●' }

const TEXT_EXTS = new Set([
  'txt','md','csv','json','log','ts','js','jsx','tsx','py','go','java','rs','cpp','c','h',
  'yaml','yml','xml','html','htm','css','sql','sh','env','toml','ini','cfg',
])

function canReadAsText(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return TEXT_EXTS.has(ext)
}

export default function AuditPanel({ poleId }) {
  const [missions, setMissions]     = useState([])
  const [selected, setSelected]     = useState(null)
  const [docs, setDocs]             = useState([])
  const [rapport, setRapport]       = useState(null)
  const [form, setForm]             = useState({ titre: '', description: '' })
  const [showForm, setShow]         = useState(false)
  const [loading, setLoading]       = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]     = useState('')
  const [dragging, setDragging]     = useState(false)
  const [uploadErr, setUploadErr]   = useState('')
  const [tab, setTab]               = useState('docs') // 'docs' | 'rapport'
  const fileRef = useRef(null)

  useEffect(() => {
    req(`/api/poles/${poleId}/audit`).then(data => {
      setMissions(data)
      if (data.length > 0 && !selected) setSelected(data[0].id)
    }).catch(() => {})
  }, [poleId])

  useEffect(() => {
    if (!selected) { setDocs([]); setRapport(null); return }
    req(`/api/audit/${selected}/documents`).then(setDocs).catch(() => {})
    req(`/api/audit/${selected}/rapport`).then(setRapport).catch(() => {})
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

  async function removePole(missionId, pid) {
    await req(`/api/audit/${missionId}/poles/${pid}`, { method: 'DELETE' })
    setMissions(prev => prev.map(m =>
      m.id === missionId ? { ...m, poles: m.poles.filter(p => p.id !== pid) } : m
    ))
  }

  async function deleteDoc(id) {
    await req(`/api/audit/documents/${id}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  async function uploadFiles(files) {
    setUploadErr('')
    for (const file of files) {
      if (!canReadAsText(file.name)) {
        setUploadErr(`"${file.name}" : format non pris en charge inline. Utilisez le workspace pour les PDF/Word.`)
        continue
      }
      try {
        const contenu = await file.text()
        const ext = file.name.split('.').pop()?.toLowerCase() || 'txt'
        const doc = await req(`/api/audit/${selected}/documents`, {
          method: 'POST',
          body: JSON.stringify({ nom: file.name, type: ext, contenu }),
        })
        setDocs(prev => [doc, ...prev])
      } catch (err) {
        setUploadErr(`Erreur upload "${file.name}" : ${err.message}`)
      }
    }
  }

  function onFileChange(e) {
    if (e.target.files?.length) uploadFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) uploadFiles(Array.from(e.dataTransfer.files))
  }

  async function generateReport() {
    setGenerating(true)
    setGenError('')
    try {
      const data = await req(`/api/audit/${selected}/generate-report`, { method: 'POST' })
      setRapport(data)
      setTab('rapport')
    } catch (err) {
      setGenError(err.message)
    } finally { setGenerating(false) }
  }

  function copyMarkdown() {
    if (rapport?.rapport?.contenu) navigator.clipboard.writeText(rapport.rapport.contenu)
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
                    <button className={styles.poleTagRemove} onClick={() => removePole(currentMission.id, p.id)} title="Retirer ce pôle">✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className={styles.tabBar} style={{ display: 'flex', gap: 4, margin: '12px 0 8px' }}>
            <button
              className={tab === 'docs' ? styles.btnPrimary : styles.btnGhost}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setTab('docs')}
            >
              Documents ({docs.length})
            </button>
            <button
              className={tab === 'rapport' ? styles.btnPrimary : styles.btnGhost}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setTab('rapport')}
            >
              {rapport ? 'Rapport ✓' : 'Rapport'}
            </button>
          </div>

          {/* Tab: Documents */}
          {tab === 'docs' && (
            <div className={styles.docsSection}>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? '#6366f1' : '#374151'}`,
                  borderRadius: 8,
                  padding: '12px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  marginBottom: 10,
                  fontSize: 12,
                  color: dragging ? '#6366f1' : '#9ca3af',
                  transition: 'all 0.15s',
                }}
              >
                {dragging ? 'Déposez ici' : '📎 Glissez des fichiers texte ou cliquez pour sélectionner'}
                <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={onFileChange} />
              </div>
              {uploadErr && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 8px' }}>{uploadErr}</p>}
              <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>
                Formats supportés inline : .txt .md .csv .json .js .ts .py .yaml .html…<br />
                Pour les PDF/Word : uploadez via le workspace (Document Intelligence).
              </p>

              {docs.length === 0 && <p className={styles.empty}>Aucun document.</p>}
              {docs.map(doc => (
                <div key={doc.id} className={styles.docCard}>
                  <div className={styles.rowTitle}>📄 {doc.nom}</div>
                  {doc.analyse && <div className={styles.analyse}>{doc.analyse.slice(0, 200)}…</div>}
                  <button className={styles.micro} style={{ color: '#ef4444' }} onClick={() => deleteDoc(doc.id)}>✕</button>
                </div>
              ))}

              <div style={{ marginTop: 12 }}>
                <button
                  className={styles.btnPrimary}
                  disabled={docs.length === 0 || generating}
                  onClick={generateReport}
                  style={{ width: '100%' }}
                >
                  {generating ? '⏳ Génération en cours…' : '✨ Générer le rapport IA'}
                </button>
                {genError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{genError}</p>}
              </div>
            </div>
          )}

          {/* Tab: Rapport */}
          {tab === 'rapport' && (
            <div className={styles.docsSection}>
              {!rapport && (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <p className={styles.empty} style={{ marginBottom: 12 }}>
                    Aucun rapport généré. Ajoutez des documents et cliquez sur "Générer le rapport IA".
                  </p>
                  <button
                    className={styles.btnPrimary}
                    disabled={docs.length === 0 || generating}
                    onClick={generateReport}
                  >
                    {generating ? '⏳ Génération en cours…' : '✨ Générer le rapport IA'}
                  </button>
                  {genError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{genError}</p>}
                </div>
              )}

              {rapport && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      Généré le {new Date(rapport.rapport.createdAt).toLocaleString('fr-FR')}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className={styles.btnGhost} style={{ fontSize: 11 }} onClick={copyMarkdown}>
                        📋 Copier MD
                      </button>
                      <button
                        className={styles.btnSecondary}
                        style={{ fontSize: 11 }}
                        disabled={docs.length === 0 || generating}
                        onClick={generateReport}
                      >
                        {generating ? '⏳…' : '↺ Regénérer'}
                      </button>
                    </div>
                  </div>

                  {/* Résumé exécutif */}
                  <section style={{ marginBottom: 18 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#e5e7eb' }}>📋 Résumé exécutif</h4>
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: '#d1d5db', whiteSpace: 'pre-wrap', background: '#1f2937', padding: '10px 12px', borderRadius: 6 }}>
                      {rapport.rapport.contenu.match(/## 📋 Résumé exécutif\n\n([\s\S]*?)\n\n##/)?.[1] || ''}
                    </div>
                  </section>

                  {/* Findings */}
                  {rapport.findings?.length > 0 && (
                    <section style={{ marginBottom: 18 }}>
                      <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#e5e7eb' }}>
                        🔍 Constats ({rapport.findings.length})
                      </h4>
                      {Object.entries(
                        rapport.findings.reduce((acc, f) => {
                          if (!acc[f.categorie]) acc[f.categorie] = []
                          acc[f.categorie].push(f)
                          return acc
                        }, {})
                      ).map(([cat, items]) => (
                        <div key={cat} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</div>
                          {items.map(f => (
                            <div key={f.id} style={{
                              display: 'flex', gap: 8, alignItems: 'flex-start',
                              padding: '6px 10px', borderRadius: 6, marginBottom: 4,
                              background: SEV_COLORS[f.severite] + '11',
                              borderLeft: `3px solid ${SEV_COLORS[f.severite]}`,
                            }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                background: SEV_COLORS[f.severite] + '33', color: SEV_COLORS[f.severite],
                                whiteSpace: 'nowrap', marginTop: 1,
                              }}>{f.severite.toUpperCase()}</span>
                              <div>
                                <div style={{ fontSize: 12, color: '#e5e7eb' }}>{f.description}</div>
                                {f.source && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Source : {f.source}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </section>
                  )}

                  {/* Recommandations */}
                  {rapport.recommandations?.length > 0 && (
                    <section>
                      <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#e5e7eb' }}>
                        ✅ Recommandations ({rapport.recommandations.length})
                      </h4>
                      {rapport.recommandations.map((r, i) => (
                        <div key={r.id} style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start',
                          padding: '6px 10px', borderRadius: 6, marginBottom: 4,
                          background: '#1f2937',
                          borderLeft: `3px solid ${PRIO_COLORS[r.priorite]}`,
                        }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                            background: PRIO_COLORS[r.priorite] + '33', color: PRIO_COLORS[r.priorite],
                            whiteSpace: 'nowrap', marginTop: 1,
                          }}>{r.priorite.toUpperCase()}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: '#e5e7eb' }}>{r.action}</div>
                          </div>
                          <span style={{ fontSize: 12, color: '#6b7280' }} title={r.statut}>{STATUT_R_ICONS[r.statut]}</span>
                        </div>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {missions.length === 0 && !showForm && (
        <p className={styles.empty}>Crée une mission d'audit pour commencer.</p>
      )}
    </div>
  )
}
