import { Hono } from 'hono'
import { generateText } from 'ai'
import { getModel } from '@/llm'

export const conseilRouter = new Hono()

interface ConseilVoix {
  provider: string
  model: string
}

/**
 * POST /api/conseil
 * Soumet un même prompt à plusieurs modèles en parallèle et retourne toutes les réponses.
 * Utilisé par le mode "Conseil LLM" d'IPCRA pour comparer des perspectives multi-modèles.
 */
conseilRouter.post('/', async (c) => {
  const body = await c.req.json<{
    prompt:    string
    system?:   string
    providers: ConseilVoix[]
  }>()

  const { prompt, system, providers } = body

  if (!prompt || !Array.isArray(providers) || providers.length === 0) {
    return c.json({ error: 'prompt et providers requis' }, 400)
  }

  // Cap à 5 modèles pour éviter les surcharges
  const voix = providers.slice(0, 5)

  const results = await Promise.allSettled(
    voix.map(async ({ provider, model }) => {
      const t0 = Date.now()
      try {
        const llm = getModel(provider, model)
        const { text } = await generateText({
          model: llm,
          system: system || 'Réponds de façon concise et structurée.',
          prompt,
          maxTokens: 800,
        })
        return { provider, model, answer: text, duree_ms: Date.now() - t0, error: null }
      } catch (err: any) {
        return { provider, model, answer: '', duree_ms: Date.now() - t0, error: err.message || 'Erreur' }
      }
    })
  )

  const responses = results.map(r => r.status === 'fulfilled' ? r.value : {
    provider: 'unknown', model: 'unknown', answer: '', duree_ms: 0,
    error: (r as PromiseRejectedResult).reason?.message || 'Erreur inconnue',
  })

  return c.json({ responses })
})
