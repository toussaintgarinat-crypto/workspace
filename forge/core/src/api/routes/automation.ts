import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { automationRules } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/automation', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const rules = await db.select().from(automationRules)
    .where(and(
      eq(automationRules.userId, user.sub),
      orgId ? eq(automationRules.orgId, orgId) : sql`1=1`,
    ))
    .orderBy(desc(automationRules.createdAt))
  return c.json(rules)
})

app.post('/automation', zValidator('json', z.object({
  nom:         z.string().min(1).max(200),
  description: z.string().optional(),
  trigger:     z.string().min(1),
  conditions:  z.record(z.any()).optional(),
  actions:     z.array(z.any()).optional(),
  actif:       z.boolean().optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [rule] = await db.insert(automationRules).values({
    userId: user.sub, orgId: orgId ?? undefined,
    nom: body.nom, description: body.description ?? '',
    trigger: body.trigger,
    conditions: JSON.stringify(body.conditions ?? {}),
    actions: JSON.stringify(body.actions ?? []),
    actif: body.actif ?? true,
  }).returning()
  return c.json(rule, 201)
})

app.patch('/automation/:id', zValidator('json', z.object({
  nom:         z.string().optional(),
  trigger:     z.string().optional(),
  conditions:  z.record(z.any()).optional(),
  actions:     z.array(z.any()).optional(),
  actif:       z.boolean().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const update: any = { ...body, updatedAt: new Date() }
  if (body.conditions) update.conditions = JSON.stringify(body.conditions)
  if (body.actions) update.actions = JSON.stringify(body.actions)
  const [rule] = await db.update(automationRules).set(update)
    .where(and(eq(automationRules.id, id), eq(automationRules.userId, user.sub)))
    .returning()
  return c.json(rule)
})

app.delete('/automation/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
