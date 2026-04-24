import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateText } from 'ai'
import { getModel } from '../../llm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.post('/prospection/analyze', zValidator('json', z.object({
  entreprise: z.string().min(2),
  secteur:    z.string().optional(),
  url:        z.string().url().optional(),
  contact:    z.string().optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const model = getModel()
  const { text } = await generateText({
    model,
    prompt: `Tu es un expert en prospection B2B. Analyse cette cible de prospection :

Entreprise : ${body.entreprise}
Secteur : ${body.secteur ?? 'non précisé'}
URL : ${body.url ?? 'non précisée'}
Contact : ${body.contact ?? 'non précisé'}

Génère :
1. **Profil de la cible** — description, besoins supposés, taille estimée
2. **Angle d'approche** — comment adresser cette entreprise
3. **Email de prospection** — objet + corps personnalisé
4. **Points de douleur** — 3 problèmes que tu peux résoudre
5. **Score d'intérêt** — note /10 avec justification

Réponds en français.`,
  })
  return c.json({ entreprise: body.entreprise, analyse: text, generatedAt: new Date().toISOString() })
})

app.post('/prospection/email', zValidator('json', z.object({
  entreprise: z.string(),
  contact:    z.string().optional(),
  contexte:   z.string().optional(),
  produit:    z.string().optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const model = getModel()
  const { text } = await generateText({
    model,
    prompt: `Rédige un email de prospection B2B pour ${body.entreprise}${body.contact ? `, à l'attention de ${body.contact}` : ''}.
${body.produit ? `Notre offre : ${body.produit}` : ''}
${body.contexte ? `Contexte : ${body.contexte}` : ''}

L'email doit être :
- Personnalisé et non générique
- Court (150-200 mots max)
- Avec un objet percutant
- Avec un CTA clair
- En français

Format : OBJET: ...\n\n[corps de l'email]`,
  })
  return c.json({ entreprise: body.entreprise, email: text })
})

export default app
