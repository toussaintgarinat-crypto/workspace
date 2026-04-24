import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateText } from 'ai'
import { getModel } from '../../llm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.post('/content-agent/generate', zValidator('json', z.object({
  sujet:  z.string().min(3),
  type:   z.enum(['article', 'post_linkedin', 'tweet', 'email', 'landing_page', 'newsletter']).optional(),
  ton:    z.string().optional(),
  longueur: z.enum(['court', 'moyen', 'long']).optional(),
  motsCles: z.array(z.string()).optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const type = body.type ?? 'article'
  const ton = body.ton ?? 'professionnel et engageant'
  const longueur = body.longueur ?? 'moyen'
  const motsCles = body.motsCles?.join(', ') ?? ''
  const model = getModel()

  const longueurMap = { court: '300-500 mots', moyen: '800-1200 mots', long: '2000-3000 mots' }

  const { text } = await generateText({
    model,
    prompt: `Tu es un expert en création de contenu marketing. Génère un ${type} sur : "${body.sujet}".

Contraintes :
- Ton : ${ton}
- Longueur : ${longueurMap[longueur]}
- Mots-clés à intégrer : ${motsCles || 'à ta discrétion'}
- Langue : français
${type === 'article' ? '- Inclus un titre accrocheur, une introduction, des sous-titres H2, une conclusion et un CTA' : ''}
${type === 'post_linkedin' ? '- Commence par une phrase d\'accroche, utilise des émojis avec modération, inclus des hashtags' : ''}
${type === 'tweet' ? '- Maximum 280 caractères, percutant, avec 2-3 hashtags' : ''}

Génère directement le contenu, sans préambule.`,
  })
  return c.json({ sujet: body.sujet, type, contenu: text, generatedAt: new Date().toISOString() })
})

export default app
