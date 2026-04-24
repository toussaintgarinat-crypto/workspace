import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { okrs, keyResults, poles } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// List OKRs for a pole
app.get('/poles/:poleId/okrs', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const list = await db.select().from(okrs)
    .where(and(eq(okrs.poleId, poleId), eq(okrs.userId, user.sub)))
    .orderBy(desc(okrs.createdAt))

  const withKRs = await Promise.all(list.map(async o => {
    const krs = await db.select().from(keyResults).where(eq(keyResults.okrId, o.id))
    const progression = krs.length
      ? Math.round(krs.reduce((acc, kr) => acc + Math.min((kr.valeurActuelle! / kr.valeurCible!) * 100, 100), 0) / krs.length)
      : 0
    return { ...o, keyResults: krs, progression }
  }))
  return c.json(withKRs)
})

// Create OKR
app.post('/poles/:poleId/okrs', zValidator('json', z.object({
  titre:       z.string().min(1),
  description: z.string().optional(),
  periode:     z.string().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [o] = await db.insert(okrs).values({ ...body, poleId, userId: user.sub }).returning()
  return c.json({ ...o, keyResults: [], progression: 0 }, 201)
})

// Update OKR
app.patch('/okrs/:id', zValidator('json', z.object({
  titre:       z.string().optional(),
  description: z.string().optional(),
  statut:      z.enum(['actif', 'atteint', 'abandonne']).optional(),
  periode:     z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [o] = await db.update(okrs).set({ ...body, updatedAt: new Date() })
    .where(and(eq(okrs.id, id), eq(okrs.userId, user.sub))).returning()
  return c.json(o)
})

// Delete OKR
app.delete('/okrs/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(okrs).where(and(eq(okrs.id, id), eq(okrs.userId, user.sub)))
  return c.json({ ok: true })
})

// Add Key Result
app.post('/okrs/:okrId/kr', zValidator('json', z.object({
  titre:           z.string().min(1),
  valeurCible:     z.number().optional(),
  valeurActuelle:  z.number().optional(),
  unite:           z.string().optional(),
})), async (c) => {
  const { okrId } = c.req.param()
  const body = c.req.valid('json')
  const [kr] = await db.insert(keyResults).values({ okrId, ...body }).returning()
  return c.json(kr, 201)
})

// Update Key Result value
app.patch('/kr/:id', zValidator('json', z.object({
  valeurActuelle: z.number().optional(),
  titre:          z.string().optional(),
  valeurCible:    z.number().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const body = c.req.valid('json')
  const [kr] = await db.update(keyResults).set(body).where(eq(keyResults.id, id)).returning()
  return c.json(kr)
})

// Delete Key Result
app.delete('/kr/:id', async (c) => {
  const { id } = c.req.param()
  await db.delete(keyResults).where(eq(keyResults.id, id))
  return c.json({ ok: true })
})

export default app
