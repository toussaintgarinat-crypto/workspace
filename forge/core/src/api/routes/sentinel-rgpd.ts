import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateText } from 'ai'
import { getModel } from '../../llm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

const RGPD_CHECKLIST = [
  { id: 'registre', label: 'Registre des traitements', articles: ['Art. 30'] },
  { id: 'consentement', label: 'Gestion du consentement', articles: ['Art. 6', 'Art. 7'] },
  { id: 'droit_acces', label: 'Droit d\'accès et portabilité', articles: ['Art. 15', 'Art. 20'] },
  { id: 'droit_effacement', label: 'Droit à l\'effacement', articles: ['Art. 17'] },
  { id: 'notification_violation', label: 'Procédure de notification de violation', articles: ['Art. 33'] },
  { id: 'dpia', label: 'Analyse d\'impact (DPIA)', articles: ['Art. 35'] },
  { id: 'dpo', label: 'Désignation DPO si requis', articles: ['Art. 37'] },
  { id: 'transferts', label: 'Transferts hors UE encadrés', articles: ['Art. 44-49'] },
  { id: 'minimisation', label: 'Minimisation des données', articles: ['Art. 5'] },
  { id: 'duree_conservation', label: 'Durées de conservation définies', articles: ['Art. 5'] },
]

app.get('/sentinel-rgpd/checklist', async (c) => {
  return c.json(RGPD_CHECKLIST)
})

app.post('/sentinel-rgpd/audit', zValidator('json', z.object({
  entreprise:   z.string().min(2),
  secteur:      z.string().optional(),
  description:  z.string().optional(),
  checklist:    z.record(z.boolean()).optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const model = getModel()

  const checklistStatus = body.checklist
    ? RGPD_CHECKLIST.map(item => ({
        ...item,
        conforme: body.checklist?.[item.id] ?? false,
      }))
    : RGPD_CHECKLIST.map(item => ({ ...item, conforme: false }))

  const nonConformes = checklistStatus.filter(c => !c.conforme).map(c => c.label)

  const { text } = await generateText({
    model,
    prompt: `Tu es un expert RGPD/DPO. Effectue un audit de conformité RGPD pour :

Entreprise : ${body.entreprise}
Secteur : ${body.secteur ?? 'non précisé'}
Description : ${body.description ?? 'non précisée'}

Points de non-conformité identifiés :
${nonConformes.map(nc => `- ${nc}`).join('\n')}

Pour chaque point non conforme, fournis :
1. Le risque associé
2. Les actions correctives prioritaires
3. Un délai recommandé pour mise en conformité

Calcule aussi un score de conformité sur 100 et donne les 3 actions les plus urgentes.

Réponds en français de manière structurée.`,
  })

  const score = Math.round((checklistStatus.filter(c => c.conforme).length / RGPD_CHECKLIST.length) * 100)

  return c.json({
    entreprise: body.entreprise,
    score,
    checklist: checklistStatus,
    analyse: text,
    generatedAt: new Date().toISOString(),
  })
})

export default app
