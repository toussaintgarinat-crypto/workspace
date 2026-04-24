import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateText } from 'ai'
import { getModel } from '../../llm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.post('/seo-agent/analyze', zValidator('json', z.object({
  url:     z.string().url(),
  poleId:  z.string().uuid().optional(),
})), async (c) => {
  const { url, poleId } = c.req.valid('json')
  const model = getModel()
  const { text } = await generateText({
    model,
    prompt: `Tu es un expert SEO. Effectue une analyse SEO complète de ce site : ${url}

Analyse les points suivants et donne des recommandations concrètes :
1. **Title et méta-description** — pertinence, longueur, mots-clés
2. **Structure du contenu** — H1/H2/H3, lisibilité
3. **Mots-clés** — densité, placement, opportunités
4. **Performance** — Core Web Vitals, vitesse de chargement estimée
5. **Mobile** — compatibilité mobile
6. **Backlinks** — profil de liens supposé
7. **Score global** — note sur 100 avec justification

Réponds en français avec des émojis pour chaque section. Sois précis et actionnable.`,
  })
  return c.json({ url, analyse: text, generatedAt: new Date().toISOString() })
})

app.post('/seo-agent/keywords', zValidator('json', z.object({
  sujet:  z.string().min(3),
  langue: z.string().optional(),
})), async (c) => {
  const { sujet, langue = 'fr' } = c.req.valid('json')
  const model = getModel()
  const { text } = await generateText({
    model,
    prompt: `Génère une liste de 20 mots-clés SEO pertinents pour le sujet : "${sujet}" en langue ${langue}.
Pour chaque mot-clé, indique : volume estimé (faible/moyen/élevé), intention (info/transactionnel/navigational), difficulté (1-10).
Format : JSON array avec { keyword, volume, intention, difficulte }`,
  })
  let keywords = []
  try { keywords = JSON.parse(text) } catch { keywords = [{ keyword: sujet, volume: 'moyen', intention: 'info', difficulte: 5 }] }
  return c.json({ sujet, keywords })
})

export default app
