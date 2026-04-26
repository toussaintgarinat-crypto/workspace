import { useState, useEffect, useRef } from 'react'
import { api, authHeaders } from '../services/api.js'

const BASE    = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const ACCEPT  = '.pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.ppt,.pptx,.png,.jpg,.jpeg,.mp3,.mp4'

const PHASES = [
  { key: 'identifier', label: 'Identifier', icon: '🔍', field: 'identifier_notes',
    hint: 'Clarifie le contexte, les objectifs, les ressources disponibles et les contraintes.' },
  { key: 'planifier',  label: 'Planifier',  icon: '🗺️', field: 'planifier_notes',
    hint: 'Construis un plan d\'action structuré avec étapes, durées et dépendances.' },
  { key: 'creer',      label: 'Créer',      icon: '⚒️', field: 'creer_output',
    hint: 'Produis le livrable. Itère par brouillons successifs et documente tes choix.' },
  { key: 'reflechir',  label: 'Réfléchir',  icon: '🪞', field: 'reflechir_notes',
    hint: 'Analyse de façon critique ce qui a été produit. Identifie biais et points d\'amélioration.' },
  { key: 'ajuster',    label: 'Ajuster',    icon: '🔧', field: 'ajuster_notes',
    hint: 'Synthétise les leçons apprises. Mets à jour ta mémoire. Planifie les prochaines itérations.' },
]

// ── Helpers ───────────────────────────────────────────────────────

function phaseField(key) {
  return key === 'creer' ? 'creer_output' : `${key}_notes`
}

function formatAnswer(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => (
    line.trim() === '' ? <br key={i} /> : <p key={i}>{line}</p>
  ))
}

// ── Composant principal ───────────────────────────────────────────

export default function IPCRAPanel({ worldId, agents = [] }) {
  const [sessions, setSessions]     = useState([])
  const [active, setActive]         = useState(null)
  const [view, setView]             = useState('list')
  const [newTitle, setNewTitle]     = useState('')
  const [newAgent, setNewAgent]     = useState('')
  const [creating, setCreating]     = useState(false)
  const [sessionDocs, setSessionDocs] = useState([])

  useEffect(() => { fetchSessions() }, [worldId])

  useEffect(() => {
    if (active?.id) fetchSessionDocs(active.id)
  }, [active?.id])

  async function fetchSessions() {
    const data = await api.get('/ipcra/')
    setSessions(Array.isArray(data) ? data : [])
  }

  async function fetchSessionDocs(sessionId) {
    const data = await api.get(`/documents/?world_id=${worldId || ''}`)
    if (Array.isArray(data)) {
      setSessionDocs(data.filter(d => d.has_content))
    }
  }

  async function createSession() {
    if (!newTitle.trim()) return
    setCreating(true)
    const data = await api.post('/ipcra/', {
      titre: newTitle,
      world_id: worldId || null,
      agent_id: newAgent || null,
    })
    setCreating(false)
    if (data) {
      setNewTitle('')
      setNewAgent('')
      setSessions(prev => [data, ...prev])
      setActive(data)
      setView('session')
    }
  }

  async function savePhase(phaseKey, content) {
    if (!active) return
    const updated = await api.patch(`/ipcra/${active.id}/phase/${phaseKey}`, { content })
    if (updated) setActive(updated)
  }

  async function advancePhase() {
    if (!active) return
    const updated = await api.post(`/ipcra/${active.id}/advance`, {})
    if (updated) { setActive(updated); fetchSessions() }
  }

  async function openSession(s) {
    const fresh = await api.get(`/ipcra/${s.id}`)
    setActive(fresh || s)
    setView('session')
  }

  async function deleteSession(s) {
    if (!confirm(`Supprimer "${s.titre}" ?`)) return
    await api.del(`/ipcra/${s.id}`)
    if (active?.id === s.id) { setActive(null); setView('list') }
    fetchSessions()
  }

  async function attachDoc(docId) {
    if (!active) return
    const r = await api.post(`/ipcra/${active.id}/attach-document`, { doc_id: docId })
    if (r?.ok) {
      window.dispatchEvent(new CustomEvent('oria:toast', {
        detail: 'Document indexé dans MemPalace ✓'
      }))
    }
  }

  const currentPhaseIdx = active ? PHASES.findIndex(p => p.key === active.phase) : 0
  const currentPhase    = PHASES[currentPhaseIdx]

  // ── Vue liste ─────────────────────────────────────────────────

  if (view === 'list') return (
    <div className="ipcra-panel">
      <div className="ipcra-header">
        <h2>🎯 Sessions IPCRA</h2>
        <p className="ipcra-subtitle">Identifier · Planifier · Créer · Réfléchir · Ajuster</p>
      </div>

      <div className="ipcra-new-session">
        <input
          type="text"
          placeholder="Titre de la nouvelle session…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createSession()}
        />
        {agents.length > 0 && (
          <select value={newAgent} onChange={e => setNewAgent(e.target.value)}>
            <option value="">Sans agent</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.avatar_emoji} {a.nom}</option>
            ))}
          </select>
        )}
        <button onClick={createSession} disabled={!newTitle.trim() || creating}>
          {creating ? '⏳' : '＋ Créer'}
        </button>
      </div>

      <div className="ipcra-sessions-list">
        {sessions.length === 0 ? (
          <div className="ipcra-empty">
            <span>🎯</span>
            <p>Aucune session. Crée ta première session IPCRA.</p>
          </div>
        ) : sessions.map(s => {
          const phaseIdx = PHASES.findIndex(p => p.key === s.phase)
          return (
            <div
              key={s.id}
              className={`ipcra-session-item ${s.status}`}
              onClick={() => openSession(s)}
            >
              <div className="ipcra-si-left">
                <div className="ipcra-si-titre">{s.titre}</div>
                <div className="ipcra-si-meta">
                  {s.status === 'completee' ? '✅ Complétée'
                    : s.status === 'archivee' ? '📦 Archivée'
                    : (
                      <div className="ipcra-progress">
                        {PHASES.map((p, i) => (
                          <div
                            key={p.key}
                            className={`ipcra-dot ${i < phaseIdx ? 'done' : ''} ${i === phaseIdx ? 'current' : ''}`}
                            title={p.label}
                          />
                        ))}
                        <span>{PHASES[phaseIdx]?.icon} {PHASES[phaseIdx]?.label}</span>
                      </div>
                    )}
                </div>
              </div>
              <button
                className="ipcra-si-delete"
                onClick={e => { e.stopPropagation(); deleteSession(s) }}
              >🗑</button>
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── Vue session ───────────────────────────────────────────────

  const completedPhases = PHASES.slice(0, currentPhaseIdx)

  return (
    <div className="ipcra-session-view">
      {/* Topbar */}
      <div className="ipcra-session-topbar">
        <button className="btn-back" onClick={() => { setView('list') }}>← Sessions</button>
        <h2>{active?.titre}</h2>
        <span className={`ipcra-status-badge ${active?.status}`}>{active?.status}</span>
      </div>

      {/* Progress bar */}
      <div className="ipcra-phases-bar">
        {PHASES.map((p, i) => (
          <div
            key={p.key}
            className={`ipcra-phase-step ${i < currentPhaseIdx ? 'done' : ''} ${i === currentPhaseIdx ? 'active' : ''}`}
          >
            <span className="phase-icon">{p.icon}</span>
            <span className="phase-label">{p.label}</span>
          </div>
        ))}
      </div>

      <div className="ipcra-phase-content">
        {/* Phases passées — accordéon */}
        {completedPhases.length > 0 && (
          <PastPhasesAccordion phases={completedPhases} session={active} />
        )}

        {/* Phase active */}
        {currentPhase && active?.status === 'active' && (
          <>
            <div className="ipcra-current-phase-header">
              <span>{currentPhase.icon}</span>
              <div>
                <div className="ipcra-current-phase-title">{currentPhase.label}</div>
                <div className="phase-hint">{currentPhase.hint}</div>
              </div>
            </div>

            <PhaseEditor
              phase={currentPhase}
              value={active?.[currentPhase.field] || ''}
              onSave={(content) => savePhase(currentPhase.key, content)}
            />

            {/* Upload documents (surtout utile en Identifier) */}
            <DocumentSection
              sessionId={active.id}
              sessionTitre={active.titre}
              worldId={worldId}
              existingDocs={sessionDocs}
              onAttach={attachDoc}
              onUploaded={() => fetchSessionDocs(active.id)}
            />

            {/* Assistance IA */}
            <AIAssist
              session={active}
              phase={currentPhase}
              agentAssigned={!!active?.agent_id}
            />

            {/* Conseil multi-modèles */}
            {active?.agent_id && (
              <ConseilLLM session={active} phase={currentPhase} />
            )}

            {/* Avocat du Diable */}
            {active?.agent_id && (
              <DevilAdvocate
                session={active}
                phase={currentPhase}
                phaseContent={active?.[currentPhase.field] || ''}
              />
            )}

            {/* Historique des traces persistées */}
            <TraceHistory sessionId={active.id} />

            {/* Avancer */}
            {currentPhaseIdx < PHASES.length - 1 ? (
              <button className="btn-advance-phase" onClick={advancePhase}>
                Passer à {PHASES[currentPhaseIdx + 1]?.icon} {PHASES[currentPhaseIdx + 1]?.label} →
              </button>
            ) : (
              <button className="btn-complete-ipcra" onClick={advancePhase}>
                ✅ Compléter la session
              </button>
            )}
          </>
        )}

        {active?.status === 'completee' && (
          <div className="ipcra-completed">
            <span>✅</span>
            <p>Session complétée. Les phases ont été sauvegardées dans MemPalace.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Phases passées en accordéon ───────────────────────────────────

function PastPhasesAccordion({ phases, session }) {
  const [open, setOpen] = useState(null)

  return (
    <div className="ipcra-past-phases">
      {phases.map(p => {
        const content = session?.[p.field] || ''
        const isOpen  = open === p.key
        return (
          <div key={p.key} className="ipcra-past-phase">
            <button
              className="ipcra-past-phase-toggle"
              onClick={() => setOpen(isOpen ? null : p.key)}
            >
              <span className="ipcra-past-check">✓</span>
              <span>{p.icon} {p.label}</span>
              <span className="ipcra-past-arrow">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="ipcra-past-content">
                {content || <em className="ipcra-empty-phase">Aucune note pour cette phase.</em>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Éditeur de phase avec auto-save ──────────────────────────────

function PhaseEditor({ phase, value, onSave }) {
  const [text, setText]     = useState(value)
  const [status, setStatus] = useState('idle') // 'idle' | 'saving' | 'saved'
  const timer = useRef(null)

  useEffect(() => { setText(value) }, [value])

  function handleChange(val) {
    setText(val)
    setStatus('idle')
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setStatus('saving')
      await onSave(val)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    }, 1800)
  }

  return (
    <div className="phase-editor">
      <div className="phase-editor-bar">
        {status === 'saving' && <span className="save-status saving">⏳ Sauvegarde…</span>}
        {status === 'saved'  && <span className="save-status saved">✓ Sauvegardé</span>}
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={`Notes pour la phase ${phase.label}…`}
        rows={9}
      />
    </div>
  )
}

// ── Section documents ─────────────────────────────────────────────

function DocumentSection({ sessionId, sessionTitre, worldId, existingDocs, onAttach, onUploaded }) {
  const [open, setOpen]         = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attached, setAttached]  = useState(new Set())
  const fileRef = useRef(null)

  async function upload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)

    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      form.append('index_memory', 'true')
      form.append('session_id', sessionId)
      form.append('session_titre', sessionTitre)
      if (worldId) form.append('world_id', worldId)

      try {
        const r = await fetch(`${BASE}/api/documents/upload`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(),
          body: form,
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          window.dispatchEvent(new CustomEvent('oria:error', {
            detail: err.detail || `Erreur upload ${r.status}`,
          }))
        }
      } catch {
        window.dispatchEvent(new CustomEvent('oria:error', { detail: 'Erreur upload' }))
      }
    }

    setUploading(false)
    onUploaded()
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleAttach(docId) {
    await onAttach(docId)
    setAttached(prev => new Set([...prev, docId]))
  }

  return (
    <div className="ipcra-doc-section">
      <button
        className="ipcra-doc-toggle"
        onClick={() => setOpen(o => !o)}
      >
        📎 Documents &amp; MemPalace {open ? '▲' : '▼'}
      </button>

      {open && (
        <div className="ipcra-doc-body">
          {/* Upload */}
          <div className="ipcra-doc-upload-row">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              onChange={upload}
              style={{ display: 'none' }}
            />
            <button
              className="btn-upload-doc"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? '⏳ Upload…' : '+ Uploader un document'}
            </button>
            <span className="ipcra-doc-hint">
              PDF, Word, Excel, PPT, images, audio — converti en Markdown et indexé dans MemPalace
            </span>
          </div>

          {/* Docs existants du world à lier */}
          {existingDocs.length > 0 && (
            <div className="ipcra-doc-list">
              <div className="ipcra-doc-list-title">Documents du workspace</div>
              {existingDocs.slice(0, 12).map(d => (
                <div key={d.id} className="ipcra-doc-row">
                  <span className="ipcra-doc-name" title={d.nom}>{d.nom}</span>
                  <button
                    className={`btn-attach-doc ${attached.has(d.id) ? 'attached' : ''}`}
                    onClick={() => handleAttach(d.id)}
                    disabled={attached.has(d.id)}
                  >
                    {attached.has(d.id) ? '✓ Indexé' : '→ MemPalace'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Assistance IA ─────────────────────────────────────────────────

function AIAssist({ session, phase, agentAssigned }) {
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [answer, setAnswer]     = useState(null)
  const [steps, setSteps]       = useState([])
  const [showSteps, setShowSteps] = useState(false)

  async function ask() {
    if (!input.trim()) return
    setLoading(true)
    setAnswer(null)
    setSteps([])

    const data = await api.post(`/ipcra/${session.id}/assist`, {
      phase: phase.key,
      prompt: input,
    })

    setAnswer(data?.answer || null)
    setSteps(Array.isArray(data?.steps) ? data.steps : [])
    setLoading(false)
  }

  return (
    <div className="ipcra-ai-assist">
      <div className="ipcra-ai-header">
        🤖 Assistance IA
        {agentAssigned
          ? <span className="ipcra-ai-badge agent">agent assigné</span>
          : <span className="ipcra-ai-badge noagent">sans agent</span>}
        {session.agent_id &&
          <span className="ipcra-ai-badge memory">🧠 MemPalace</span>}
      </div>

      <div className="ipcra-ai-input-row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Demande de l'aide pour "${phase.label}"…`}
          onKeyDown={e => e.key === 'Enter' && ask()}
          disabled={loading}
        />
        <button onClick={ask} disabled={!input.trim() || loading}>
          {loading ? '⏳' : '↑'}
        </button>
      </div>

      {answer && (
        <div className="ipcra-ai-answer">
          <div className="ipcra-ai-answer-text">
            {formatAnswer(answer)}
          </div>

          {steps.length > 0 && (
            <div className="ipcra-trace">
              <button
                className="ipcra-trace-toggle"
                onClick={() => setShowSteps(s => !s)}
              >
                🔍 Trace agent ({steps.length} étape{steps.length > 1 ? 's' : ''}) {showSteps ? '▲' : '▼'}
              </button>
              {showSteps && (
                <div className="ipcra-trace-steps">
                  {steps.map((step, i) => (
                    <div key={i} className="ipcra-trace-step">
                      <div className="ipcra-trace-step-header">
                        <span className="ipcra-trace-num">{i + 1}</span>
                        <span className="ipcra-trace-tool">{step.tool || step.action || 'step'}</span>
                      </div>
                      {step.input && (
                        <div className="ipcra-trace-io">
                          <span className="io-label">Entrée</span>
                          <code>{typeof step.input === 'string'
                            ? step.input
                            : JSON.stringify(step.input, null, 2)}
                          </code>
                        </div>
                      )}
                      {step.output && (
                        <div className="ipcra-trace-io">
                          <span className="io-label">Sortie</span>
                          <code>{typeof step.output === 'string'
                            ? step.output.slice(0, 300)
                            : JSON.stringify(step.output, null, 2).slice(0, 300)}
                          </code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Historique des traces persistées ─────────────────────────────

function TraceHistory({ sessionId }) {
  const [traces, setTraces] = useState([])
  const [open, setOpen]     = useState(false)
  const [openTrace, setOpenTrace] = useState(null)

  useEffect(() => {
    if (open && sessionId) {
      api.get(`/ipcra/${sessionId}/traces`).then(data => {
        if (Array.isArray(data)) setTraces(data)
      })
    }
  }, [open, sessionId])

  return (
    <div className="ipcra-trace-history">
      <button
        className="ipcra-trace-history-toggle"
        onClick={() => setOpen(o => !o)}
      >
        📜 Historique traces {open ? `(${traces.length})` : ''} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="ipcra-trace-history-list">
          {traces.length === 0 && <p className="ipcra-trace-empty">Aucune trace enregistrée.</p>}
          {traces.map(t => (
            <div key={t.id} className="ipcra-trace-history-item">
              <div
                className="ipcra-trace-history-header"
                onClick={() => setOpenTrace(openTrace === t.id ? null : t.id)}
              >
                <span className="ipcra-trace-phase-tag">{t.phase}</span>
                <span className="ipcra-trace-agent-tag">{t.agent_nom}</span>
                <span className="ipcra-trace-dur">{t.duree_ms}ms</span>
                <span className="ipcra-trace-date">
                  {new Date(t.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span>{openTrace === t.id ? '▲' : '▼'}</span>
              </div>
              {openTrace === t.id && (
                <div className="ipcra-trace-history-body">
                  <div className="ipcra-trace-prompt"><strong>Prompt :</strong> {t.prompt}</div>
                  <div className="ipcra-trace-answer">{t.answer.slice(0, 400)}{t.answer.length > 400 ? '…' : ''}</div>
                  {t.steps.length > 0 && (
                    <div className="ipcra-trace-steps-mini">
                      {t.steps.map((s, i) => (
                        <span key={i} className="ipcra-trace-step-chip">
                          {s.tool || s.action || `step ${i + 1}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Conseil LLM (multi-modèles parallèles) ────────────────────────

const CONSEIL_PRESETS = [
  { provider: 'anthropic', model: 'claude-sonnet-4-6',          label: 'Claude Sonnet' },
  { provider: 'openai',    model: 'gpt-4o',                     label: 'GPT-4o' },
  { provider: 'groq',      model: 'llama-3.3-70b-versatile',    label: 'Llama 3.3 70B' },
  { provider: 'gemini',    model: 'gemini-2.0-flash',           label: 'Gemini 2.0 Flash' },
  { provider: 'ollama',    model: 'llama3.2',                   label: 'Llama 3.2 (local)' },
]

function ConseilLLM({ session, phase }) {
  const [prompt, setPrompt]       = useState('')
  const [selected, setSelected]   = useState([0, 1])   // indices dans CONSEIL_PRESETS
  const [loading, setLoading]     = useState(false)
  const [responses, setResponses] = useState([])
  const [error, setError]         = useState(null)
  const [open, setOpen]           = useState(false)

  async function runConseil() {
    if (!prompt.trim() || selected.length < 2) return
    setLoading(true)
    setError(null)
    setResponses([])
    const providers = selected.map(i => CONSEIL_PRESETS[i])
    const data = await api.post(`/ipcra/${session.id}/conseil`, { prompt, providers })
    if (data?.responses) {
      setResponses(data.responses)
    } else if (data?.detail) {
      setError(data.detail)
    }
    setLoading(false)
  }

  function toggleModel(i) {
    setSelected(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i].slice(0, 5)
    )
  }

  return (
    <div className="ipcra-conseil">
      <button className="ipcra-conseil-toggle" onClick={() => setOpen(o => !o)}>
        🧠 Conseil LLM {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="ipcra-conseil-body">
          <p className="ipcra-conseil-hint">Compare plusieurs modèles sur la même question.</p>

          <div className="ipcra-conseil-models">
            {CONSEIL_PRESETS.map((p, i) => (
              <button
                key={i}
                className={`ipcra-conseil-model-btn ${selected.includes(i) ? 'active' : ''}`}
                onClick={() => toggleModel(i)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="ipcra-ai-input-row">
            <input
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Question pour le Conseil…"
              onKeyDown={e => e.key === 'Enter' && runConseil()}
              disabled={loading}
            />
            <button onClick={runConseil} disabled={!prompt.trim() || selected.length < 2 || loading}>
              {loading ? '⏳' : '↑'}
            </button>
          </div>
          {selected.length < 2 && <p className="ipcra-conseil-warn">Sélectionne au moins 2 modèles.</p>}

          {error && <p className="ipcra-conseil-error">{error}</p>}

          {responses.length > 0 && (
            <div className="ipcra-conseil-grid">
              {responses.map((r, i) => (
                <div key={i} className={`ipcra-conseil-card ${r.error ? 'erreur' : ''}`}>
                  <div className="ipcra-conseil-card-header">
                    <span className="ipcra-conseil-model-name">{r.model}</span>
                    <span className="ipcra-conseil-provider">{r.provider}</span>
                    <span className="ipcra-conseil-dur">{r.duree_ms}ms</span>
                  </div>
                  <div className="ipcra-conseil-card-body">
                    {r.error
                      ? <span className="ipcra-conseil-err-msg">⚠ {r.error}</span>
                      : formatAnswer(r.answer)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Mode Avocat du Diable ─────────────────────────────────────────

function DevilAdvocate({ session, phase, phaseContent }) {
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [open, setOpen]         = useState(false)

  async function runDevil() {
    if (!phaseContent?.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    const data = await api.post(`/ipcra/${session.id}/devil`, {
      content: phaseContent,
      phase: phase.key,
    })
    if (data?.critique) {
      setResult(data)
      setOpen(true)
    } else if (data?.detail) {
      setError(data.detail)
    }
    setLoading(false)
  }

  return (
    <div className="ipcra-devil">
      <button
        className={`ipcra-devil-btn ${loading ? 'loading' : ''}`}
        onClick={runDevil}
        disabled={loading || !phaseContent?.trim()}
        title={!phaseContent?.trim() ? 'Remplis d\'abord la phase' : undefined}
      >
        {loading ? '⏳ Analyse…' : '😈 Avocat du Diable'}
      </button>

      {error && <p className="ipcra-devil-error">{error}</p>}

      {result && open && (
        <div className="ipcra-devil-result">
          <div className="ipcra-devil-header">
            <span>😈 Analyse critique</span>
            <button className="ipcra-devil-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="ipcra-devil-section">
            <div className="ipcra-devil-section-label">Critique principale</div>
            <p className="ipcra-devil-text">{result.critique}</p>
          </div>

          {result.biais?.length > 0 && (
            <div className="ipcra-devil-section">
              <div className="ipcra-devil-section-label">Biais cognitifs détectés</div>
              <ul className="ipcra-devil-list">
                {result.biais.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}

          {result.questions?.length > 0 && (
            <div className="ipcra-devil-section">
              <div className="ipcra-devil-section-label">Questions difficiles</div>
              <ul className="ipcra-devil-list questions">
                {result.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}

          {result.steelman && (
            <div className="ipcra-devil-section">
              <div className="ipcra-devil-section-label">Steelman (argument opposé le plus fort)</div>
              <p className="ipcra-devil-text steelman">{result.steelman}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
