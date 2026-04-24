import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { pushSubscriptions } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/push/subscriptions', async (c) => {
  const user = c.get('user')
  const subs = await db.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, createdAt: pushSubscriptions.createdAt })
    .from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.sub))
  return c.json(subs)
})

app.post('/push/subscribe', zValidator('json', z.object({
  endpoint: z.string().url(),
  p256dh:   z.string(),
  auth:     z.string(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [sub] = await db.insert(pushSubscriptions).values({
    userId: user.sub,
    endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth,
  }).returning()
  return c.json(sub, 201)
})

app.delete('/push/subscriptions/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
