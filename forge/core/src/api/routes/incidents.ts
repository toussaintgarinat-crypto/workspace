import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { incidents } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/poles/:poleId/incidents', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const list = await db.select().from(incidents)
    .where(and(eq(incidents.poleId, poleId), eq(incidents.userId, user.sub)))
    .orderBy(desc(incidents.createdAt))
  return c.json(list)
})

app.post('/poles/:poleId/incidents', zValidator('json', z.object({
  titre:       z.string().min(1).max(300),
  description: z.string().optional(),
  severite:    z.enum(['critique', 'haute', 'moyenne', 'basse']).optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [incident] = await db.insert(incidents).values({
    poleId, userId: user.sub,
    titre: body.titre,
    description: body.description ?? '',
    severite: body.severite ?? 'moyenne',
  }).returning()
  return c.json(incident, 201)
})

app.patch('/incidents/:id', zValidator('json', z.object({
  titre:       z.string().optional(),
  description: z.string().optional(),
  severite:    z.enum(['critique', 'haute', 'moyenne', 'basse']).optional(),
  statut:      z.enum(['ouvert', 'en_cours', 'resolu', 'ferme']).optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.titre)       updates.titre = body.titre
  if (body.description !== undefined) updates.description = body.description
  if (body.severite)    updates.severite = body.severite
  if (body.statut) {
    updates.statut = body.statut
    if (body.statut === 'resolu') updates.resolvedAt = new Date()
  }
  const [incident] = await db.update(incidents).set(updates)
    .where(and(eq(incidents.id, id), eq(incidents.userId, user.sub)))
    .returning()
  if (!incident) return c.json({ error: 'Not found' }, 404)
  return c.json(incident)
})

app.delete('/incidents/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(incidents).where(and(eq(incidents.id, id), eq(incidents.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
