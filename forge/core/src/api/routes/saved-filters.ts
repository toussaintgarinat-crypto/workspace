import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { savedFilters } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/saved-filters', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const contexte = c.req.query('contexte')
  const rows = await db.select().from(savedFilters)
    .where(and(
      eq(savedFilters.userId, user.sub),
      orgId ? eq(savedFilters.orgId, orgId) : sql`1=1`,
      contexte ? eq(savedFilters.contexte, contexte) : sql`1=1`,
    ))
    .orderBy(desc(savedFilters.createdAt))
  return c.json(rows)
})

app.post('/saved-filters', zValidator('json', z.object({
  nom:      z.string().min(1).max(200),
  contexte: z.string().optional(),
  filtre:   z.record(z.any()),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [filter] = await db.insert(savedFilters).values({
    userId: user.sub, orgId: orgId ?? undefined,
    nom: body.nom, contexte: body.contexte ?? '',
    filtre: JSON.stringify(body.filtre),
  }).returning()
  return c.json(filter, 201)
})

app.delete('/saved-filters/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(savedFilters)
    .where(and(eq(savedFilters.id, id), eq(savedFilters.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
