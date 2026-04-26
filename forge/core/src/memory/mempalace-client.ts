/**
 * MemPalace HTTP client — opt-in via env vars.
 * Set MEMPALACE_API_URL + MEMPALACE_API_TOKEN to enable.
 */

const API_URL   = (process.env.MEMPALACE_API_URL   ?? '').replace(/\/$/, '')
const API_TOKEN = process.env.MEMPALACE_API_TOKEN   ?? ''

const ENABLED         = Boolean(API_URL && API_TOKEN)
const SIMILARITY_MIN  = 0.35

interface MemHit {
  content:  string
  metadata: Record<string, unknown>
  score:    number
}

function authHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${API_TOKEN}`,
  }
}

export async function memPrefetch(query: string, n = 5, wing?: string): Promise<MemHit[]> {
  if (!ENABLED) return []
  try {
    const body: Record<string, unknown> = { query, n_results: n }
    if (wing) body.wing = wing
    const res = await fetch(`${API_URL}/api/search`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify(body),
    })
    if (!res.ok) return []
    const data = await res.json() as { results?: MemHit[] }
    return (data.results ?? []).filter(h => h.score >= SIMILARITY_MIN)
  } catch {
    return []
  }
}

export async function memSync(
  content:  string,
  wing:     string,
  room:     string,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  if (!ENABLED || !content.trim()) return false
  try {
    const res = await fetch(`${API_URL}/api/drawers`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ content, wing, room, metadata: metadata ?? {} }),
    })
    return res.status === 201
  } catch {
    return false
  }
}

export function memFormatContext(hits: MemHit[]): string {
  if (!hits.length) return ''
  const blocks = hits.map(h => {
    const snippet = h.content.length > 450
      ? h.content.slice(0, 450) + '…'
      : h.content
    const wing = String(h.metadata?.wing ?? '?')
    const room = String(h.metadata?.room ?? '?')
    return `[${wing}/${room} · score ${h.score}]\n${snippet}`
  })
  return '\n\n## Mémoires MemPalace\n' + blocks.join('\n\n---\n\n')
}

export const mempalaceEnabled = ENABLED
