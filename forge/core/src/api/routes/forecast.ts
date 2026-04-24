import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { forecastEntries, budgetEntries } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/poles/:poleId/forecast', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const entries = await db.select().from(forecastEntries)
    .where(and(eq(forecastEntries.poleId, poleId), eq(forecastEntries.userId, user.sub)))
    .orderBy(desc(forecastEntries.anneeMois))
  return c.json(entries)
})

app.post('/poles/:poleId/forecast', zValidator('json', z.object({
  anneeMois: z.string().regex(/^\d{4}-\d{2}$/, 'Format YYYY-MM'),
  montant:   z.number(),
  categorie: z.string().optional(),
  type:      z.enum(['recette', 'depense']).optional(),
  source:    z.enum(['manuel', 'llm']).optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [entry] = await db.insert(forecastEntries).values({
    poleId, userId: user.sub,
    anneeMois: body.anneeMois, montant: body.montant,
    categorie: body.categorie ?? '',
    type: body.type ?? 'recette', source: body.source ?? 'manuel',
  }).returning()
  return c.json(entry, 201)
})

app.delete('/forecast/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(forecastEntries)
    .where(and(eq(forecastEntries.id, id), eq(forecastEntries.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
