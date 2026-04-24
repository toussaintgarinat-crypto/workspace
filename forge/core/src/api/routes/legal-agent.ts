import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateText } from 'ai'
import { getModel } from '../../llm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

const TEMPLATES = {
  nda: 'Accord de Non-Divulgation (NDA)',
  cgv: 'Conditions Générales de Vente (CGV)',
  cgu: 'Conditions Générales d\'Utilisation (CGU)',
  contrat_prestation: 'Contrat de Prestation de Services',
  contrat_travail: 'Contrat de Travail',
  politique_confidentialite: 'Politique de Confidentialité RGPD',
}

app.get('/legal-agent/templates', async (c) => {
  return c.json(Object.entries(TEMPLATES).map(([key, label]) => ({ key, label })))
})

app.post('/legal-agent/generate', zValidator('json', z.object({
  type:     z.enum(['nda', 'cgv', 'cgu', 'contrat_prestation', 'contrat_travail', 'politique_confidentialite']),
  parties:  z.record(z.string()),
  options:  z.record(z.any()).optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const model = getModel()
  const template = TEMPLATES[body.type]
  const partiesStr = Object.entries(body.parties).map(([k, v]) => `${k}: ${v}`).join('\n')

  const { text } = await generateText({
    model,
    prompt: `Tu es un juriste expert en droit français. Génère un document juridique : ${template}

Parties impliquées :
${partiesStr}

Options : ${JSON.stringify(body.options ?? {})}

Le document doit :
- Être conforme au droit français en vigueur
- Inclure toutes les clauses essentielles
- Être rédigé en français juridique clair
- Inclure les sections : préambule, définitions, obligations, durée, résiliation, loi applicable
- Avoir des espaces pour les signatures

IMPORTANT : Ceci est un modèle à adapter par un professionnel du droit.`,
  })
  return c.json({ type: body.type, template, document: text, generatedAt: new Date().toISOString() })
})

app.post('/legal-agent/analyze', zValidator('json', z.object({
  contenu:  z.string().min(50),
  question: z.string().optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const model = getModel()
  const { text } = await generateText({
    model,
    prompt: `Tu es un juriste expert. Analyse ce document juridique :

${body.contenu.slice(0, 3000)}

${body.question ? `Question spécifique : ${body.question}` : 'Identifie les points clés, les risques potentiels et les clauses manquantes.'}

Réponds en français de manière structurée.`,
  })
  return c.json({ analyse: text })
})

export default app
