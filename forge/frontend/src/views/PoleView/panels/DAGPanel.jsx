import { useState, useEffect, useRef, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { api } from '../../../services/api.jsx'

const STATUT_COLOR = {
  pending: '#4f545c',
  running: '#5865F2',
  done:    '#57F287',
  error:   '#ED4245',
}

const CRITICITE_SIZE = {
  faible:   8,
  normale:  11,
  haute:    14,
  critique: 18,
}

export default function DAGPanel({ poleId }) {
  const [tasks, setTasks]         = useState([])
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [selected, setSelected]   = useState(null)
  const [running, setRunning]     = useState(false)
  const [form, setForm]           = useState({ nom: '', agentOwner: '', criticite: 'normale', dependances: [] })
  const graphRef = useRef()
  const pollRef  = useRef()

  useEffect(() => {
    load()
    return () => clearInterval(pollRef.current)
  }, [poleId])

  async function load() {
    try {
      const items = await api.get(`/api/poles/${poleId}/dag`)
      setTasks(items)
      buildGraph(items)
    } catch {}
  }

  function buildGraph(items) {
    setGraphData({
      nodes: items.map(t => ({
        id: t.id, nom: t.nom, statut: t.statut,
        criticite: t.criticite, agentOwner: t.agentOwner,
      })),
      links: items.flatMap(t => {
        const deps = JSON.parse(t.dependances || '[]')
        return deps
          .filter(depId => items.some(i => i.id === depId))
          .map(depId => ({ source: depId, target: t.id }))
      }),
    })
  }

  function startPolling() {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const items = await api.get(`/api/poles/${poleId}/dag`)
        setTasks(items)
        buildGraph(items)
        if (items.every(t => t.statut === 'done' || t.statut === 'error')) {
          clearInterval(pollRef.current)
          setRunning(false)
        }
      } catch {}
    }, 1500)
  }

  async function runDAG() {
    if (running || tasks.length === 0) return
    setRunning(true)
    try {
      await api.post(`/api/poles/${poleId}/dag/run`, {})
      startPolling()
    } catch {
      setRunning(false)
    }
  }

  async function createTask() {
    if (!form.nom.trim()) return
    try {
      await api.post(`/api/poles/${poleId}/dag`, {
        nom:        form.nom.trim(),
        agentOwner: form.agentOwner || undefined,
        criticite:  form.criticite,
        dependances: form.dependances,
      })
      setForm({ nom: '', agentOwner: '', criticite: 'normale', dependances: [] })
      load()
    } catch {}
  }

  async function deleteTask(id) {
    try {
      await api.delete(`/api/dag/${id}`)
      setSelected(null)
      load()
    } catch {}
  }

  async function resetTask(id) {
    try {
      await api.patch(`/api/dag/${id}`, { statut: 'pending' })
      load()
    } catch {}
  }

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const r = CRITICITE_SIZE[node.criticite] || 11
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = STATUT_COLOR[node.statut] || '#4f545c'
    ctx.fill()
    ctx.strokeStyle = selected?.id === node.id ? '#fff' : 'rgba(255,255,255,0.15)'
    ctx.lineWidth   = selected?.id === node.id ? 2.5 : 1
    ctx.stroke()

    const fontSize = Math.max(8, 11 / globalScale)
    ctx.font = `${fontSize}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(node.nom.length > 14 ? node.nom.slice(0, 13) + '…' : node.nom, node.x, node.y + r + 3 / globalScale)
  }, [selected])

  const linkCanvasObject = useCallback((link, ctx) => {
    const s = link.source, e = link.target
    if (typeof s !== 'object' || !s.x) return
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(e.x, e.y)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    const angle = Math.atan2(e.y - s.y, e.x - s.x)
    const r = CRITICITE_SIZE[e.criticite] || 11
    const tx = e.x - Math.cos(angle) * (r + 4)
    const ty = e.y - Math.sin(angle) * (r + 4)
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx - 7 * Math.cos(angle - Math.PI / 6), ty - 7 * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(tx - 7 * Math.cos(angle + Math.PI / 6), ty - 7 * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fill()
  }, [])

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 140px)', gap: '1rem', padding: '0.75rem' }}>

      {/* Graphe */}
      <div style={{ flex: 1, position: 'relative', background: '#1e2124', borderRadius: 10, overflow: 'hidden' }}>
        {tasks.length === 0 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 40 }}>🕸️</span>
            <span style={{ fontSize: 14 }}>Créez des tâches pour visualiser le DAG</span>
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeCanvasObject={nodeCanvasObject}
            nodeCanvasObjectMode={() => 'replace'}
            linkCanvasObject={linkCanvasObject}
            linkCanvasObjectMode={() => 'replace'}
            onNodeClick={node => setSelected(node)}
            onNodeDragEnd={node => { node.fx = node.x; node.fy = node.y }}
            backgroundColor="#1e2124"
            cooldownTicks={200}
            d3AlphaDecay={0.012}
            d3VelocityDecay={0.4}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
          />
        )}

        {/* Légende */}
        <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 14, fontSize: 11, background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: '4px 10px' }}>
          {Object.entries(STATUT_COLOR).map(([k, c]) => (
            <span key={k} style={{ color: '#ddd', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0 }} />
              {k}
            </span>
          ))}
        </div>

        {/* Bouton reset zoom */}
        <button
          onClick={() => {
            graphData.nodes.forEach(n => { n.fx = undefined; n.fy = undefined })
            graphRef.current?.d3ReheatSimulation()
            setTimeout(() => graphRef.current?.zoomToFit(500, 60), 1000)
          }}
          style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid #4f545c', borderRadius: 6, color: '#ccc', padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}
        >↺</button>
      </div>

      {/* Panel latéral */}
      <div style={{ width: 270, display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto' }}>

        {/* Nœud sélectionné */}
        {selected && (
          <div style={{ background: '#2b2d31', borderRadius: 8, padding: '0.75rem', fontSize: 13, borderLeft: `3px solid ${STATUT_COLOR[selected.statut]}` }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{selected.nom}</div>
            <div style={{ color: STATUT_COLOR[selected.statut], marginBottom: 4 }}>{selected.statut} · {selected.criticite}</div>
            {selected.agentOwner && <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>Agent : {selected.agentOwner}</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => resetTask(selected.id)} style={btnStyle('#4f545c')}>↺ Reset</button>
              <button onClick={() => deleteTask(selected.id)} style={btnStyle('#ED4245')}>✕ Suppr.</button>
            </div>
          </div>
        )}

        {/* Formulaire nouvelle tâche */}
        <div style={{ background: '#2b2d31', borderRadius: 8, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>Nouvelle tâche</div>
          <input
            placeholder="Nom *"
            value={form.nom}
            onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && createTask()}
            style={inputStyle}
          />
          <input
            placeholder="Agent (optionnel)"
            value={form.agentOwner}
            onChange={e => setForm(p => ({ ...p, agentOwner: e.target.value }))}
            style={inputStyle}
          />
          <select
            value={form.criticite}
            onChange={e => setForm(p => ({ ...p, criticite: e.target.value }))}
            style={inputStyle}
          >
            <option value="faible">Faible</option>
            <option value="normale">Normale</option>
            <option value="haute">Haute</option>
            <option value="critique">Critique</option>
          </select>
          {tasks.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#aaa' }}>Dépend de :</div>
              <div style={{ maxHeight: 100, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tasks.map(t => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.dependances.includes(t.id)}
                      onChange={e => setForm(p => ({
                        ...p,
                        dependances: e.target.checked
                          ? [...p.dependances, t.id]
                          : p.dependances.filter(d => d !== t.id),
                      }))}
                    />
                    <span style={{ color: STATUT_COLOR[t.statut] }}>■</span> {t.nom}
                  </label>
                ))}
              </div>
            </>
          )}
          <button onClick={createTask} style={btnStyle('#5865F2', true)}>+ Créer la tâche</button>
        </div>

        {/* Exécuter */}
        <button
          onClick={runDAG}
          disabled={running || tasks.length === 0}
          style={{
            background: running ? '#4f545c' : '#57F287',
            color: running ? '#aaa' : '#111',
            border: 'none', borderRadius: 8, padding: '10px',
            cursor: running || tasks.length === 0 ? 'default' : 'pointer',
            fontWeight: 700, fontSize: 14, transition: 'all 0.2s',
          }}
        >
          {running ? '⏳ Exécution en cours…' : '▶ Exécuter le DAG'}
        </button>

        {/* Liste des tâches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tasks.map(t => (
            <div
              key={t.id}
              onClick={() => setSelected(t)}
              style={{
                background: selected?.id === t.id ? '#383a40' : '#2b2d31',
                borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                borderLeft: `3px solid ${STATUT_COLOR[t.statut]}`,
              }}
            >
              <div style={{ fontWeight: 500, color: '#fff' }}>{t.nom}</div>
              <div style={{ color: '#aaa', display: 'flex', gap: 8, marginTop: 2 }}>
                <span style={{ color: STATUT_COLOR[t.statut] }}>{t.statut}</span>
                <span>{t.criticite}</span>
                {t.agentOwner && <span>· {t.agentOwner}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  background: '#1e2124', border: '1px solid #4f545c',
  borderRadius: 4, padding: '5px 8px', color: '#fff', fontSize: 13, width: '100%', boxSizing: 'border-box',
}

function btnStyle(bg, full = false) {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: 4,
    padding: '5px 10px', cursor: 'pointer', fontSize: 12,
    ...(full ? { width: '100%' } : {}),
  }
}
