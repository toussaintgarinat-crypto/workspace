import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { llmPresets, poles, poleTools, ventures, agentDefinitions, providerApiKeys } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { decrypt } from '@/config/crypto'
import { AVAILABLE_PROVIDERS, resolveLlmConfig } from '@/llm'

export const llmConfigRouter = new Hono()

function ollamaBase() {
  return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api').replace(/\/api\/?$/, '')
}

async function getUserKey(userId: string, provider: string): Promise<string | null> {
  const [row] = await db.select().from(providerApiKeys)
    .where(and(eq(providerApiKeys.userId, userId), eq(providerApiKeys.provider, provider)))
  if (row?.encryptedKey) {
    try { return await decrypt(row.encryptedKey) } catch {}
  }
  return process.env[`${provider.toUpperCase()}_API_KEY`] ?? null
}

function filterModels(provider: string, ids: string[]): string[] {
  const excl = /embed|whisper|tts-|dall-|realtime|transcri/i
  switch (provider) {
    case 'openai':
      return ids.filter(m => /^(gpt-|o[1-9]|chatgpt-)/.test(m) && !excl.test(m))
    case 'gemini':
      return ids.filter(m => /^gemini/.test(m))
    default:
      return ids.filter(m => !excl.test(m))
  }
}

// GET /api/llm-config/providers
llmConfigRouter.get('/providers', (c) => c.json(AVAILABLE_PROVIDERS))

// GET /api/llm-config/ollama/models — modèles installés sur l'instance Ollama
llmConfigRouter.get('/ollama/models', async (c) => {
  try {
    const res = await fetch(`${ollamaBase()}/api/tags`)
    if (!res.ok) return c.json({ models: [] })
    const data = await res.json()
    const models = (data.models ?? []).map((m: any) => m.name ?? m.model).filter(Boolean)
    return c.json({ models, dynamic: true })
  } catch {
    return c.json({ models: [] })
  }
})

// GET /api/llm-config/:provider/models — modèles dynamiques pour les providers cloud
llmConfigRouter.get('/:provider/models', async (c) => {
  const provider = c.req.param('provider')
  const user = c.get('user') as { sub: string }
  const fallback = AVAILABLE_PROVIDERS.find(p => p.id === provider)?.models ?? []

  try {
    const key = await getUserKey(user.sub, provider)

    let ids: string[] | null = null

    if (provider === 'openai' || provider === 'deepseek') {
      if (!key) return c.json({ models: fallback, dynamic: false })
      const base = provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com'
      const res = await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${key}` } })
      if (res.ok) {
        const data = await res.json()
        ids = data.data?.map((m: any) => m.id) ?? null
      }
    } else if (provider === 'groq') {
      if (!key) return c.json({ models: fallback, dynamic: false })
      const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
      if (res.ok) {
        const data = await res.json()
        ids = data.data?.map((m: any) => m.id) ?? null
      }
    } else if (provider === 'mistral') {
      if (!key) return c.json({ models: fallback, dynamic: false })
      const res = await fetch('https://api.mistral.ai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
      if (res.ok) {
        const data = await res.json()
        ids = data.data?.map((m: any) => m.id) ?? null
      }
    } else if (provider === 'gemini') {
      if (!key) return c.json({ models: fallback, dynamic: false })
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
      if (res.ok) {
        const data = await res.json()
        ids = data.models?.map((m: any) => m.name.replace('models/', '')) ?? null
      }
    } else if (provider === 'openrouter') {
      const headers: Record<string, string> = {}
      if (key) headers.Authorization = `Bearer ${key}`
      const res = await fetch('https://openrouter.ai/api/v1/models', { headers })
      if (res.ok) {
        const data = await res.json()
        ids = data.data?.map((m: any) => m.id) ?? null
      }
    } else if (provider === 'lmstudio') {
      const base = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1'
      const res = await fetch(`${base}/models`)
      if (res.ok) {
        const data = await res.json()
        ids = data.data?.map((m: any) => m.id) ?? null
      }
    }

    if (!ids) return c.json({ models: fallback, dynamic: false })

    const filtered = filterModels(provider, ids).sort()
    return c.json({ models: filtered.length ? filtered : fallback, dynamic: true })
  } catch {
    return c.json({ models: fallback, dynamic: false })
  }
})

// POST /api/llm-config/ollama/pull — télécharge un modèle (stream NDJSON)
llmConfigRouter.post('/ollama/pull', async (c) => {
  const { name } = await c.req.json()
  if (!name) return c.json({ error: 'name required' }, 400)

  let ollamaRes: Response
  try {
    ollamaRes = await fetch(`${ollamaBase()}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true }),
    })
  } catch {
    return c.json({ error: 'Ollama unreachable' }, 503)
  }

  if (!ollamaRes.ok) return c.json({ error: 'Pull failed' }, 500)

  c.header('Content-Type', 'application/x-ndjson')
  c.header('Cache-Control', 'no-cache')

  return stream(c, async (s) => {
    const reader = ollamaRes.body!.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await s.write(value)
      }
    } finally {
      reader.releaseLock()
    }
  })
})

// DELETE /api/llm-config/ollama/models?name=... — supprime un modèle
llmConfigRouter.delete('/ollama/models', async (c) => {
  const name = c.req.query('name')
  if (!name) return c.json({ error: 'name required' }, 400)
  try {
    const res = await fetch(`${ollamaBase()}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return c.json({ error: 'Delete failed' }, 500)
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Ollama unreachable' }, 503)
  }
})

const presetSchema = z.object({
  scopeType:     z.enum(['venture', 'pole', 'tool', 'agent']),
  scopeId:       z.string().uuid(),
  ventureId:     z.string().uuid().optional(),
  provider:      z.string(),
  baseUrl:       z.string().default(''),
  apiKey:        z.string().default(''),
  model:         z.string(),
  maxTokens:     z.number().int().min(256).max(128000).default(2048),
  budgetDaily:   z.number().positive().optional(),
  budgetMonthly: z.number().positive().optional(),
})

// Résout ventureId automatiquement si non fourni
async function resolveVentureId(scopeType: string, scopeId: string): Promise<string | null> {
  if (scopeType === 'venture') return scopeId
  if (scopeType === 'pole') {
    const [p] = await db.select({ ventureId: poles.ventureId }).from(poles).where(eq(poles.id, scopeId))
    return p?.ventureId ?? null
  }
  if (scopeType === 'tool') {
    const [pt] = await db.select({ poleId: poleTools.poleId }).from(poleTools).where(eq(poleTools.id, scopeId))
    if (!pt?.poleId) return null
    const [p] = await db.select({ ventureId: poles.ventureId }).from(poles).where(eq(poles.id, pt.poleId))
    return p?.ventureId ?? null
  }
  if (scopeType === 'agent') {
    const [a] = await db.select({ poleId: agentDefinitions.poleId }).from(agentDefinitions).where(eq(agentDefinitions.id, scopeId))
    if (!a?.poleId) return null
    const [p] = await db.select({ ventureId: poles.ventureId }).from(poles).where(eq(poles.id, a.poleId))
    return p?.ventureId ?? null
  }
  return null
}

// GET /api/llm-config/preset?scopeType=&scopeId=
llmConfigRouter.get('/preset', async (c) => {
  const scopeType = c.req.query('scopeType')
  const scopeId   = c.req.query('scopeId')
  if (!scopeType || !scopeId) return c.json({ error: 'scopeType and scopeId required' }, 400)

  const [preset] = await db.select().from(llmPresets)
    .where(and(eq(llmPresets.scopeType, scopeType as any), eq(llmPresets.scopeId, scopeId)))
  return c.json(preset ?? null)
})

// GET /api/llm-config/venture/:ventureId — tous les presets d'une venture
llmConfigRouter.get('/venture/:ventureId', async (c) => {
  const { ventureId } = c.req.param()
  const presets = await db.select().from(llmPresets).where(eq(llmPresets.ventureId, ventureId))
  return c.json(presets)
})

// GET /api/llm-config/resolve — résout la config effective pour un contexte
llmConfigRouter.get('/resolve', async (c) => {
  const { agentId, toolKey, poleId, ventureId } = c.req.query() as Record<string, string>
  const preset = await resolveLlmConfig({ agentId, toolKey, poleId, ventureId })
  return c.json(preset ?? null)
})

// PUT /api/llm-config/preset — upsert
llmConfigRouter.put(
  '/preset',
  zValidator('json', presetSchema),
  async (c) => {
    const user = c.get('user') as { sub: string }
    const data = c.req.valid('json')

    const ventureId = data.ventureId ?? await resolveVentureId(data.scopeType, data.scopeId) ?? undefined

    const existing = await db.select().from(llmPresets)
      .where(and(eq(llmPresets.scopeType, data.scopeType), eq(llmPresets.scopeId, data.scopeId)))

    if (existing.length) {
      const [updated] = await db.update(llmPresets)
        .set({ ...data, ventureId, updatedAt: new Date(), updatedBy: user.sub })
        .where(and(eq(llmPresets.scopeType, data.scopeType), eq(llmPresets.scopeId, data.scopeId)))
        .returning()
      return c.json(updated)
    }

    const [created] = await db.insert(llmPresets)
      .values({ ...data, ventureId, updatedBy: user.sub })
      .returning()
    return c.json(created, 201)
  }
)

// DELETE /api/llm-config/preset?scopeType=&scopeId=
llmConfigRouter.delete('/preset', async (c) => {
  const scopeType = c.req.query('scopeType')
  const scopeId   = c.req.query('scopeId')
  if (!scopeType || !scopeId) return c.json({ error: 'scopeType and scopeId required' }, 400)

  await db.delete(llmPresets)
    .where(and(eq(llmPresets.scopeType, scopeType as any), eq(llmPresets.scopeId, scopeId)))
  return c.json({ ok: true })
})

// GET /api/llm-config/global — preset global de l'org
llmConfigRouter.get('/global', async (c) => {
  const user  = c.get('user') as { sub: string; orgId?: string }
  const orgId = c.req.header('X-Org-ID') ?? user.orgId
  if (!orgId) return c.json({ error: 'orgId required' }, 400)

  const [preset] = await db.select().from(llmPresets)
    .where(and(eq(llmPresets.scopeType, 'global' as any), eq(llmPresets.scopeId, orgId)))
  return c.json(preset ?? null)
})

// PUT /api/llm-config/global — upsert du preset global de l'org
llmConfigRouter.put('/global', async (c) => {
  const user  = c.get('user') as { sub: string; orgId?: string }
  const orgId = c.req.header('X-Org-ID') ?? user.orgId
  if (!orgId) return c.json({ error: 'orgId required' }, 400)

  const body = await c.req.json().catch(() => ({})) as { provider?: string; model?: string }
  if (!body.provider || !body.model) return c.json({ error: 'provider and model required' }, 400)

  try {
    const existing = await db.select().from(llmPresets)
      .where(and(eq(llmPresets.scopeType, 'global' as any), eq(llmPresets.scopeId, orgId)))

    if (existing.length) {
      const [updated] = await db.update(llmPresets)
        .set({ provider: body.provider, model: body.model, updatedAt: new Date(), updatedBy: user.sub })
        .where(and(eq(llmPresets.scopeType, 'global' as any), eq(llmPresets.scopeId, orgId)))
        .returning()
      return c.json(updated)
    }

    const [created] = await db.insert(llmPresets)
      .values({ scopeType: 'global' as any, scopeId: orgId, provider: body.provider, model: body.model, updatedBy: user.sub })
      .returning()
    return c.json(created, 201)
  } catch (err: any) {
    console.error('[forge:llm-config] PUT /global failed:', err?.message || err)
    return c.json({ error: err?.message || 'Database error' }, 500)
  }
})

// Rétro-compatibilité : ancien endpoint GET /:poleId
llmConfigRouter.get('/:poleId', async (c) => {
  const { poleId } = c.req.param()
  const [preset] = await db.select().from(llmPresets)
    .where(and(eq(llmPresets.scopeType, 'pole'), eq(llmPresets.scopeId, poleId)))
  return c.json(preset ?? null)
})
