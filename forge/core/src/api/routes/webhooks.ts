import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { webhooks } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/webhooks', async (c) => {
  const user = c.get('user')
  const rows = await db.select().from(webhooks).where(eq(webhooks.userId, user.sub)).orderBy(desc(webhooks.createdAt))
  return c.json(rows.map(r => ({ ...r, events: JSON.parse(r.events ?? '[]') })))
})

app.post('/webhooks', zValidator('json', z.object({
  nom:    z.string().min(1),
  url:    z.string().url(),
  events: z.array(z.string()).default([]),
  secret: z.string().optional(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [w] = await db.insert(webhooks).values({
    userId:  user.sub,
    nom:     body.nom,
    url:     body.url,
    events:  JSON.stringify(body.events),
    secret:  body.secret ?? '',
    enabled: true,
  }).returning()
  return c.json({ ...w, events: body.events }, 201)
})

app.patch('/webhooks/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json()
  if (body.events) body.events = JSON.stringify(body.events)
  const [w] = await db.update(webhooks).set(body)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, user.sub))).returning()
  return c.json(w)
})

app.delete('/webhooks/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.userId, user.sub)))
  return c.json({ ok: true })
})

// Test webhook
app.post('/webhooks/:id/test', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [w] = await db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.userId, user.sub)))
  if (!w) return c.json({ error: 'Not found' }, 404)
  try {
    const res = await fetch(w.url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...(w.secret ? { 'X-Forge-Secret': w.secret } : {}) },
      body:    JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), source: 'Forge' }),
      signal:  AbortSignal.timeout(8_000),
    })
    return c.json({ ok: res.ok, status: res.status })
  } catch (e: any) {
    return c.json({ ok: false, error: e.message })
  }
})

export default app
