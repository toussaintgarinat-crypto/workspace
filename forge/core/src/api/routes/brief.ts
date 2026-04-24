import { Hono } from 'hono'
import { db } from '../../db'
import { blackboardEvents, decisionsN0, poles, ventures } from '../../db/schema'
import { eq, desc, gte, and, inArray } from 'drizzle-orm'
import { generateText } from 'ai'
import { getModel, resolveLlmConfig } from '../../llm'

async function generateWithOllama(prompt: string, model: string): Promise<string> {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api'
  const url = base.replace(/\/api$/, '') + '/api/chat'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}`)
  const data = await res.json() as any
  return data?.message?.content ?? ''
}
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.post('/brief/generate', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({})) as { ventureId?: string }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  let ventureNom: string | null = null
  let poleIds: string[] | null = null

  // Filtrage par venture si ventureId fourni
  if (body.ventureId) {
    const [venture] = await db.select().from(ventures).where(eq(ventures.id, body.ventureId))
    if (venture) ventureNom = venture.nom
    const venturePoles = await db.select({ id: poles.id }).from(poles)
      .where(eq(poles.ventureId, body.ventureId))
    poleIds = venturePoles.map(p => p.id)
  }

  // Récupérer les événements des 24h
  const eventsQuery = db.select().from(blackboardEvents)
    .where(
      poleIds && poleIds.length > 0
        ? and(gte(blackboardEvents.createdAt, since), inArray(blackboardEvents.poleId, poleIds))
        : gte(blackboardEvents.createdAt, since)
    )
    .orderBy(desc(blackboardEvents.createdAt))
    .limit(20)
  const events = await eventsQuery

  const pendingQuery = poleIds && poleIds.length > 0
    ? db.select().from(decisionsN0).where(and(eq(decisionsN0.statut, 'en_attente'), inArray(decisionsN0.poleId, poleIds)))
    : db.select().from(decisionsN0).where(eq(decisionsN0.statut, 'en_attente'))
  const pending = await pendingQuery

  const eventsText = events.length > 0
    ? events.map(e => `[${e.poleNom}] ${e.agentNom}: ${e.payload.slice(0, 150)}`).join('\n')
    : 'Aucun événement'

  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const scope = ventureNom ? `la venture "${ventureNom}"` : 'toute l\'organisation'

  let briefText: string
  try {
    const orgId    = c.req.header('X-Org-ID') ?? undefined
    const preset   = await resolveLlmConfig({ ventureId: body.ventureId, orgId })
    const provider = preset?.provider ?? process.env.DEFAULT_LLM_PROVIDER ?? 'ollama'
    const modelId  = preset?.model    ?? process.env.DEFAULT_LLM_MODEL    ?? 'gemma4:e4b'

    const prompt = `Tu es l'assistant IA de Forge, OS d'entreprise autonome.
Le fondateur commence sa journée. Génère un brief matinal concis en français (300 mots max) pour ${scope}.

Données :
- Événements (24h) : ${eventsText}
- Décisions en attente : ${pending.length}
- Date : ${date}

Structure :
## 🌅 Ce qui s'est passé
[Points clés des 24h]

## ⚡ Points d'attention
[Risques, blocages, décisions à prendre]

## 🎯 Actions recommandées
[Top 3 priorités du jour]`

    if (provider === 'ollama') {
      briefText = await generateWithOllama(prompt, modelId)
    } else {
      const model = getModel(provider, modelId)
      const result = await generateText({ model, messages: [{ role: 'user', content: prompt }], maxTokens: 600 })
      briefText = result.text
    }
  } catch (err) {
    console.error('[forge:brief] LLM error:', err)
    // LLM unavailable — return a static brief from raw data
    briefText = `## 🌅 ${date}

**Événements des 24h :** ${events.length > 0 ? `${events.length} événement(s) enregistré(s)` : 'Aucun événement'}

**Décisions en attente :** ${pending.length} décision(s) à valider

${events.length > 0 ? `### Activité récente\n${eventsText}` : ''}

_Brief IA non disponible — LLM non configuré ou inaccessible. Configurez un modèle dans les paramètres de Forge._`
  }

  return c.json({ brief: briefText, generatedAt: new Date().toISOString(), eventsCount: events.length, pendingDecisions: pending.length })
})

export default app
