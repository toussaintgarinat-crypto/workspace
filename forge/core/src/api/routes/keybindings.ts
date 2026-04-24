import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { keybindings } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/keybindings', async (c) => {
  const user = c.get('user')
  const rows = await db.select().from(keybindings).where(eq(keybindings.userId, user.sub))
  return c.json(rows)
})

app.put('/keybindings', zValidator('json', z.object({
  touche: z.string().min(1),
  action: z.string().min(1),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [existing] = await db.select().from(keybindings)
    .where(and(eq(keybindings.userId, user.sub), eq(keybindings.touche, body.touche))).limit(1)
  if (existing) {
    const [u] = await db.update(keybindings).set({ action: body.action })
      .where(eq(keybindings.id, existing.id)).returning()
    return c.json(u)
  }
  const [created] = await db.insert(keybindings).values({
    userId: user.sub, touche: body.touche, action: body.action,
  }).returning()
  return c.json(created, 201)
})

app.delete('/keybindings/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(keybindings)
    .where(and(eq(keybindings.id, id), eq(keybindings.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
