import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { sloEntries } from '../../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

const DEFAULT_MODULES = ['chat', 'agents', 'kb', 'crm', 'billing', 'veille', 'gitpack', 'auth']

app.get('/slo', async (c) => {
  const orgId = c.req.header('X-Org-ID')
  const rows = await db.select().from(sloEntries)
    .where(orgId ? eq(sloEntries.orgId, orgId) : sql`1=1`)
  const healthScore = rows.length
    ? Math.round(rows.reduce((a, r) => a + (r.healthScore ?? 100), 0) / rows.length)
    : 100
  return c.json({ modules: rows, healthScore })
})

app.put('/slo/:module', zValidator('json', z.object({
  healthScore:  z.number().int().min(0).max(100).optional(),
  sloTarget:    z.number().optional(),
  sloCurrent:   z.number().optional(),
  erreurs24h:   z.number().int().optional(),
})), async (c) => {
  const { module } = c.req.param()
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [existing] = await db.select().from(sloEntries)
    .where(and(
      eq(sloEntries.module, module),
      orgId ? eq(sloEntries.orgId, orgId) : sql`1=1`
    )).limit(1)
  if (existing) {
    const [u] = await db.update(sloEntries)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(sloEntries.id, existing.id))
      .returning()
    return c.json(u)
  }
  const [created] = await db.insert(sloEntries).values({
    orgId: orgId ?? undefined, module, ...body
  }).returning()
  return c.json(created, 201)
})

export default app
