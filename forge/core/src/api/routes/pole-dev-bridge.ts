import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { poleDevRequests, automationRules } from '../../db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { generateText } from 'ai'
import { getModel } from '../../llm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// ── Soumettre une demande depuis n'importe quel pôle ──────────
app.post('/poles/:poleId/dev-requests', zValidator('json', z.object({
  title:          z.string().min(1),
  description:    z.string().min(1),
  sourcePoleName: z.string(),
  sourcePoleEmoji: z.string().optional(),
  frequency:      z.enum(['daily', 'weekly', 'on_event', 'manual']).default('manual'),
  priority:       z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [req] = await db.insert(poleDevRequests).values({
    sourcePoleId:    poleId,
    sourcePoleName:  body.sourcePoleName,
    sourcePoleEmoji: body.sourcePoleEmoji ?? '📌',
    title:           body.title,
    description:     body.description,
    frequency:       body.frequency,
    priority:        body.priority,
    userId:          user.sub,
    status:          'pending',
  }).returning()
  return c.json(req, 201)
})

// ── Liste toutes les demandes (vue Pôle Dev) ──────────────────
app.get('/dev/requests', async (c) => {
  const rows = await db.select().from(poleDevRequests)
    .orderBy(desc(poleDevRequests.createdAt))
  return c.json(rows)
})

// ── Demandes d'un pôle source ─────────────────────────────────
app.get('/poles/:poleId/dev-requests', async (c) => {
  const { poleId } = c.req.param()
  const rows = await db.select().from(poleDevRequests)
    .where(eq(poleDevRequests.sourcePoleId, poleId))
    .orderBy(desc(poleDevRequests.createdAt))
  return c.json(rows)
})

// ── Analyser avec LLM ─────────────────────────────────────────
app.post('/dev/requests/:id/analyze', async (c) => {
  const { id } = c.req.param()
  const [req] = await db.select().from(poleDevRequests)
    .where(eq(poleDevRequests.id, id)).limit(1)
  if (!req) return c.json({ error: 'Not found' }, 404)

  await db.update(poleDevRequests)
    .set({ status: 'analyzing', updatedAt: new Date() })
    .where(eq(poleDevRequests.id, id))

  const { text } = await generateText({
    model: getModel(),
    prompt: `Tu es un architecte logiciel senior dans une entreprise utilisant des agents IA.
Un pôle "${req.sourcePoleName}" a soumis cette demande d'automatisation :

Titre : ${req.title}
Description : ${req.description}
Fréquence : ${req.frequency}
Priorité : ${req.priority}

Analyse cette demande et réponds en JSON avec ce format exact :
{
  "feasibility": "high|medium|low",
  "effort": "small|medium|large",
  "type": "automation|integration|ai_agent|scheduled_job|webhook",
  "analysis": "Analyse en 2-3 phrases : ce qui est répétitif, pourquoi c'est automatisable, risques.",
  "proposedSolution": "Solution technique concrète en 3-4 étapes numérotées.",
  "automationTrigger": "Description du déclencheur (ex: chaque lundi 8h, à chaque nouveau CRM contact...)",
  "estimatedTimeSaved": "Estimation du temps économisé par semaine (ex: 2h/semaine)"
}`
  })

  let parsed: any = {}
  try { parsed = JSON.parse(text) } catch { parsed = { analysis: text, proposedSolution: '' } }

  const [updated] = await db.update(poleDevRequests)
    .set({
      status:           'analyzed',
      analysis:         parsed.analysis ?? text,
      proposedSolution: parsed.proposedSolution ?? '',
      updatedAt:        new Date(),
    })
    .where(eq(poleDevRequests.id, id))
    .returning()
  return c.json({ ...updated, parsed })
})

// ── Déployer (créer une Automation Rule) ─────────────────────
app.post('/dev/requests/:id/deploy', zValidator('json', z.object({
  trigger:     z.string(),
  action:      z.string(),
  conditions:  z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [req] = await db.select().from(poleDevRequests)
    .where(eq(poleDevRequests.id, id)).limit(1)
  if (!req) return c.json({ error: 'Not found' }, 404)

  const [rule] = await db.insert(automationRules).values({
    userId:     user.sub,
    nom:        req.title,
    trigger:    body.trigger,
    actions:    JSON.stringify([{ type: 'custom', value: body.action }]),
    conditions: body.conditions ?? '{}',
    actif:      true,
  }).returning()

  const [updated] = await db.update(poleDevRequests)
    .set({
      status:           'deployed',
      automationRuleId: rule.id,
      updatedAt:        new Date(),
    })
    .where(eq(poleDevRequests.id, id))
    .returning()

  return c.json({ request: updated, rule })
})

// ── Rejeter ───────────────────────────────────────────────────
app.patch('/dev/requests/:id', zValidator('json', z.object({
  status:           z.enum(['pending', 'analyzing', 'analyzed', 'building', 'deployed', 'rejected']).optional(),
  rejectionReason:  z.string().optional(),
  analysis:         z.string().optional(),
  proposedSolution: z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const body = c.req.valid('json')
  const [updated] = await db.update(poleDevRequests)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(poleDevRequests.id, id))
    .returning()
  return c.json(updated)
})

export default app
