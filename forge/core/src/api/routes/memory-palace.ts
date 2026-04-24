import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { memoryEntries } from '../../db/schema'
import { eq, and, desc, sql, lt } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/memory', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const type = c.req.query('type')
  const agentId = c.req.query('agentId')
  const entries = await db.select().from(memoryEntries)
    .where(and(
      eq(memoryEntries.userId, user.sub),
      orgId ? eq(memoryEntries.orgId, orgId) : sql`1=1`,
      type ? eq(memoryEntries.type, type as any) : sql`1=1`,
      agentId ? eq(memoryEntries.agentId, agentId) : sql`1=1`,
    ))
    .orderBy(desc(memoryEntries.updatedAt))
  return c.json(entries)
})

app.post('/memory', zValidator('json', z.object({
  cle:     z.string().min(1).max(200),
  valeur:  z.string(),
  type:    z.enum(['context', 'fact', 'preference', 'history']).optional(),
  agentId: z.string().uuid().optional(),
  ttl:     z.string().optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [entry] = await db.insert(memoryEntries).values({
    userId: user.sub, orgId: orgId ?? undefined,
    cle: body.cle, valeur: body.valeur,
    type: body.type ?? 'context',
    agentId: body.agentId,
    ttl: body.ttl ? new Date(body.ttl) : undefined,
  }).returning()
  return c.json(entry, 201)
})

app.put('/memory/:id', zValidator('json', z.object({
  valeur: z.string(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const { valeur } = c.req.valid('json')
  const [entry] = await db.update(memoryEntries)
    .set({ valeur, updatedAt: new Date() })
    .where(and(eq(memoryEntries.id, id), eq(memoryEntries.userId, user.sub)))
    .returning()
  return c.json(entry)
})

app.delete('/memory/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(memoryEntries)
    .where(and(eq(memoryEntries.id, id), eq(memoryEntries.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
