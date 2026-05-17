import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { pushSubscriptions } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'
import webpush from 'web-push'

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_EMAIL   = process.env.VAPID_EMAIL       ?? 'mailto:admin@localhost'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)
}

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

app.post('/push/send', zValidator('json', z.object({
  userId: z.string(),
  title:  z.string(),
  body:   z.string(),
  url:    z.string().optional(),
})), async (c) => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return c.json({ error: 'VAPID keys not configured' }, 503)
  }
  const { userId, title, body, url } = c.req.valid('json')
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
  if (subs.length === 0) return c.json({ sent: 0 })

  const payload = JSON.stringify({ title, body, url })
  const staleIds: string[] = []

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) staleIds.push(sub.id)
      }
    }),
  )

  if (staleIds.length > 0) {
    await Promise.all(staleIds.map(id =>
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id))
    ))
  }

  return c.json({ sent: subs.length - staleIds.length })
})

export default app
