import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { hitlRequests } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '@/api/middleware/auth'
import { metrics } from '@/metrics'
import type { JWTPayload } from '@/api/middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()
app.use('*', authMiddleware)

export const HITL_LEVELS: Record<number, string> = {
  1: 'Information',
  2: 'Confirmation',
  3: 'Approbation',
  4: 'Validation',
  5: 'Autorisation',
  6: 'Critique',
}

app.get('/hitl/pending', async (c) => {
  const user = c.get('user')
  const rows = await db.select().from(hitlRequests)
    .where(and(eq(hitlRequests.userId, user.sub), eq(hitlRequests.statut, 'pending')))
    .orderBy(desc(hitlRequests.createdAt))
  return c.json(rows)
})

app.get('/hitl/history', async (c) => {
  const user = c.get('user')
  const rows = await db.select().from(hitlRequests)
    .where(eq(hitlRequests.userId, user.sub))
    .orderBy(desc(hitlRequests.createdAt))
    .limit(50)
  return c.json(rows)
})

app.post('/hitl/requests', zValidator('json', z.object({
  sessionId: z.string().uuid().optional(),
  niveau:    z.number().int().min(1).max(6).default(1),
  action:    z.string().min(1),
  payload:   z.record(z.any()).default({}),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [req] = await db.insert(hitlRequests).values({
    userId:    user.sub,
    sessionId: body.sessionId,
    niveau:    body.niveau,
    action:    body.action,
    payload:   JSON.stringify(body.payload),
    statut:    'pending',
  }).returning()
  metrics.hitl_requests_total++
  return c.json(req, 201)
})

app.post('/hitl/requests/:id/decide', zValidator('json', z.object({
  decision: z.enum(['approved', 'rejected']),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const { decision } = c.req.valid('json')
  const [req] = await db.update(hitlRequests)
    .set({ statut: decision, decidePar: user.sub, decideAt: new Date() })
    .where(and(eq(hitlRequests.id, id), eq(hitlRequests.userId, user.sub)))
    .returning()
  if (!req) return c.json({ error: 'Not found' }, 404)
  if (decision === 'approved') metrics.hitl_approved++
  else metrics.hitl_rejected++
  return c.json(req)
})

export default app
