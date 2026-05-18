import { useState, useEffect, useCallback } from 'react'
import { token } from '../../services/api'
import styles from './AgentFactory.module.css'

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

const NIVEAU_META = {
  local:  { label: 'Local',  color: '#10b981', desc: 'Ollama / LM Studio' },
  medium: { label: 'Groq',   color: '#f59e0b', desc: 'Groq (llama 70B)' },
  api:    { label: 'API',    color: '#a78bfa', desc: 'Claude / OpenAI' },
}
const STATUT_META = {
  active:   { label: 'Actif',     color: '#10b981' },
  draft:    { label: 'Brouillon', color: '#f59e0b' },
  error:    { label: 'Erreur',    color: '#ef4444' },
  disabled: { label: 'Désactivé', color: '#6b7280' },
}

const BLANK_FORM = { nom: '', description: '', instructions: '', niveau: 'medium', llmPreset: '' }

export default function AgentFactoryView() {
  const [tab, setTab]             = useState('agents')
  const [agents, setAgents]       = useState([])
  const [templates, setTemplates] = useState([])
  const [stats, setStats]         = useState({})
  const [selected, setSelected]   = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(BLANK_FORM)
  const [filterSt, setFilterSt]   = useState('')
  const [loading, setLoading]     = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterSt) params.set('statut', filterSt)
    const { items, stats: s } = await req(`/api/agent-factory?${params}`).catch(() => ({ items: [], stats: {} }))
    setAgents(items ?? [])
    setStats(s ?? {})
  }, [filterSt])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    req('/api/agent-factory/templates').then(setTemplates).catch(() => {})
  }, [])

  function useTemplate(tpl) {
    setForm({ nom: tpl.nom, description: tpl.description, instructions: tpl.instructions, niveau: tpl.niveau, llmPreset: '' })
    setShowForm(true)
    setTab('agents')
  }

  async function create(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const a = await req('/api/agent-factory', { method: 'POST', body: JSON.stringify(form) })
      setAgents(prev => [a, ...prev])
      setSelected(a)
      setForm(BLANK_FORM)
      setShowForm(false)
    } finally { setLoading(false) }
  }

  async function updateStatut(id, statut) {
    const a = await req(`/api/agent-factory/${id}`, { method: 'PATCH', body: JSON.stringify({ statut }) })
    setAgents(prev => prev.map(x => x.id === id ? a : x))
    if (selected?.id === id) setSelected(a)
  }

  async function remove(id) {
    if (!confirm('Supprimer cet agent ?')) return
    await req(`/api/agent-factory/${id}`, { method: 'DELETE' })
    setAgents(prev => prev.filter(a => a.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.icon}>🤖</span>
        <div>
          <div className={styles.title}>Agent Factory</div>
          <div className={styles.subtitle}>Créer et gérer des agents autonomes</div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.statsRow}>
            <span className={styles.chip}>{stats.total ?? 0} agents</span>
            <span className={styles.chip} style={{ color: '#10b981' }}>{stats.actifs ?? 0} actifs</span>
            <span className={styles.chip} style={{ color: '#f59e0b' }}>{stats.drafts ?? 0} brouillons</span>
          </div>
          {tab === 'agents' && (
            <button className={styles.btnPrimary} onClick={() => setShowForm(v => !v)}>+ Agent</button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${tab === 'agents' ? styles.tabActive : ''}`} onClick={() => setTab('agents')}>
          Mes agents
          {(stats.total ?? 0) > 0 && <span className={styles.tabCount}>{stats.total}</span>}
        </button>
        <button className={`${styles.tabBtn} ${tab === 'templates' ? styles.tabActive : ''}`} onClick={() => setTab('templates')}>
          Templates
          {templates.length > 0 && <span className={styles.tabCount}>{templates.length}</span>}
        </button>
      </div>

      {/* ── Onglet Mes agents ── */}
      {tab === 'agents' && (
        <>
          <div className={styles.filterBar}>
            {['', 'active', 'draft', 'disabled', 'error'].map(s => (
              <button key={s} className={`${styles.filterBtn} ${filterSt === s ? styles.filterActive : ''}`} onClick={() => setFilterSt(s)}>
                {s ? STATUT_META[s]?.label : 'Tous'}
              </button>
            ))}
          </div>

          {showForm && (
            <form className={styles.form} onSubmit={create}>
              <input className={styles.input} placeholder="Nom de l'agent *" required value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
              <input className={styles.input} placeholder="Description courte" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <textarea className={styles.textarea} placeholder="Instructions système (prompt de base)" value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} />
              <div style={{ display: 'flex', gap: 8 }}>
                <select className={styles.select} value={form.niveau} onChange={e => setForm(f => ({ ...f, niveau: e.target.value }))}>
                  {Object.entries(NIVEAU_META).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.desc}</option>)}
                </select>
              </div>
              <div className={styles.formActions}>
                <button type="submit" className={styles.btnPrimary} disabled={loading}>Créer</button>
                <button type="button" className={styles.btnGhost} onClick={() => { setShowForm(false); setForm(BLANK_FORM) }}>Annuler</button>
              </div>
            </form>
          )}

          <div className={styles.layout}>
            <div className={styles.list}>
              {agents.length === 0 && (
                <div className={styles.empty}>
                  Aucun agent.{' '}
                  <button className={styles.linkBtn} onClick={() => setTab('templates')}>Partir d'un template →</button>
                </div>
              )}
              {agents.map(a => {
                const niv = NIVEAU_META[a.niveau] ?? NIVEAU_META.medium
                const st  = STATUT_META[a.statut] ?? STATUT_META.draft
                return (
                  <div key={a.id} className={`${styles.agentItem} ${selected?.id === a.id ? styles.agentActive : ''}`} onClick={() => setSelected(a)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span className={styles.agentNom}>{a.nom}</span>
                      <span className={styles.badge} style={{ background: st.color + '22', color: st.color }}>{st.label}</span>
                    </div>
                    {a.description && <div className={styles.agentDesc}>{a.description}</div>}
                    <div className={styles.agentMeta}>
                      <span style={{ color: niv.color }}>⚡ {niv.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {selected && (() => {
              const niv = NIVEAU_META[selected.niveau] ?? NIVEAU_META.medium
              const st  = STATUT_META[selected.statut] ?? STATUT_META.draft
              return (
                <div className={styles.detail}>
                  <div className={styles.detailHeader}>
                    <div>
                      <h2 className={styles.detailNom}>{selected.nom}</h2>
                      <span className={styles.badge} style={{ background: st.color + '22', color: st.color }}>{st.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {selected.statut === 'draft'    && <button className={styles.btnSecondary} onClick={() => updateStatut(selected.id, 'active')}>▶ Activer</button>}
                      {selected.statut === 'active'   && <button className={styles.btnSecondary} onClick={() => updateStatut(selected.id, 'disabled')}>⏸ Désactiver</button>}
                      {selected.statut === 'disabled' && <button className={styles.btnSecondary} onClick={() => updateStatut(selected.id, 'active')}>▶ Réactiver</button>}
                      <button className={styles.btnDanger} onClick={() => remove(selected.id)}>✕</button>
                    </div>
                  </div>

                  <div className={styles.infoGrid}>
                    <div className={styles.infoBlock}>
                      <div className={styles.infoLabel}>Niveau LLM</div>
                      <div style={{ color: niv.color, fontWeight: 600 }}>⚡ {niv.label} — {niv.desc}</div>
                    </div>
                    <div className={styles.infoBlock}>
                      <div className={styles.infoLabel}>Créé le</div>
                      <div style={{ color: '#a8a8c0' }}>{new Date(selected.createdAt).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>

                  {selected.description && (
                    <div className={styles.infoBlock}>
                      <div className={styles.infoLabel}>Description</div>
                      <div style={{ color: '#a8a8c0', fontSize: 13 }}>{selected.description}</div>
                    </div>
                  )}

                  {selected.instructions && (
                    <div className={styles.infoBlock}>
                      <div className={styles.infoLabel}>Instructions système</div>
                      <pre className={styles.instructions}>{selected.instructions}</pre>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </>
      )}

      {/* ── Onglet Templates ── */}
      {tab === 'templates' && (
        <div className={styles.templatesPage}>
          <div className={styles.templatesIntro}>
            Choisissez un template pour créer un agent pré-configuré. Vous pourrez personnaliser tous les champs avant de sauvegarder.
          </div>
          <div className={styles.templatesGrid}>
            {templates.map(tpl => {
              const niv = NIVEAU_META[tpl.niveau] ?? NIVEAU_META.medium
              return (
                <div key={tpl.id} className={styles.tplCard}>
                  <div className={styles.tplTop}>
                    <span className={styles.tplIcon}>{tpl.icon}</span>
                    <span className={styles.tplCategorie}>{tpl.categorie}</span>
                    <span className={styles.tplNiveau} style={{ color: niv.color }}>⚡ {niv.label}</span>
                  </div>
                  <div className={styles.tplNom}>{tpl.nom}</div>
                  <div className={styles.tplDesc}>{tpl.description}</div>
                  <button className={styles.btnUseTemplate} onClick={() => useTemplate(tpl)}>
                    Utiliser ce template →
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
