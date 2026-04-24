import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { governorConfigs, governorUsage } from '../../db/schema'
import { eq, and, desc, gte, sum, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/governor/config', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const [config] = await db.select().from(governorConfigs)
    .where(and(eq(governorConfigs.userId, user.sub), orgId ? eq(governorConfigs.orgId, orgId) : sql`1=1`))
    .limit(1)
  return c.json(config ?? { budgetJournalier: 100000, budgetMensuel: 2000000, alerteSeuil: 80, blocageSeuil: 95, actif: true })
})

app.put('/governor/config', zValidator('json', z.object({
  budgetJournalier: z.number().int().optional(),
  budgetMensuel:    z.number().int().optional(),
  alerteSeuil:      z.number().int().min(0).max(100).optional(),
  blocageSeuil:     z.number().int().min(0).max(100).optional(),
  actif:            z.boolean().optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [existing] = await db.select().from(governorConfigs)
    .where(and(eq(governorConfigs.userId, user.sub))).limit(1)
  if (existing) {
    const [updated] = await db.update(governorConfigs)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(governorConfigs.id, existing.id))
      .returning()
    return c.json(updated)
  }
  const [created] = await db.insert(governorConfigs).values({
    userId: user.sub, orgId: orgId ?? undefined, ...body
  }).returning()
  return c.json(created, 201)
})

app.get('/governor/usage', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const depuis = c.req.query('depuis')
  let query = db.select().from(governorUsage).where(eq(governorUsage.userId, user.sub))
  const rows = await db.select().from(governorUsage)
    .where(and(
      eq(governorUsage.userId, user.sub),
      depuis ? gte(governorUsage.createdAt, new Date(depuis)) : sql`1=1`
    ))
    .orderBy(desc(governorUsage.createdAt))
    .limit(500)

  const totalTokens = rows.reduce((a, r) => a + (r.tokensIn ?? 0) + (r.tokensOut ?? 0), 0)
  const totalCout = rows.reduce((a, r) => a + (r.coutUsd ?? 0), 0)
  return c.json({ rows, totalTokens, totalCout })
})

app.post('/governor/usage', zValidator('json', z.object({
  provider:  z.string(),
  model:     z.string(),
  tokensIn:  z.number().int().optional(),
  tokensOut: z.number().int().optional(),
  coutUsd:   z.number().optional(),
  poleId:    z.string().uuid().optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [entry] = await db.insert(governorUsage).values({
    userId: user.sub, orgId: orgId ?? undefined,
    provider: body.provider, model: body.model,
    tokensIn: body.tokensIn ?? 0, tokensOut: body.tokensOut ?? 0,
    coutUsd: body.coutUsd ?? 0, poleId: body.poleId,
  }).returning()
  return c.json(entry, 201)
})

export default app
