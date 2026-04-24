import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { budgetEntries } from '../../db/schema'
import { eq, and, desc, sum, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/poles/:poleId/budget', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const entries = await db.select().from(budgetEntries)
    .where(and(eq(budgetEntries.poleId, poleId), eq(budgetEntries.userId, user.sub)))
    .orderBy(desc(budgetEntries.date))

  const total = entries.reduce((acc, e) => {
    return acc + (e.type === 'recette' ? e.montant : -e.montant)
  }, 0)

  const recettes = entries.filter(e => e.type === 'recette').reduce((a, e) => a + e.montant, 0)
  const depenses = entries.filter(e => e.type === 'depense').reduce((a, e) => a + e.montant, 0)

  return c.json({ entries, total, recettes, depenses })
})

app.post('/poles/:poleId/budget', zValidator('json', z.object({
  label:     z.string().min(1).max(200),
  montant:   z.number().int().positive(),
  type:      z.enum(['recette', 'depense']),
  categorie: z.string().optional(),
  date:      z.string().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [entry] = await db.insert(budgetEntries).values({
    poleId, userId: user.sub,
    label: body.label,
    montant: body.montant,
    type: body.type,
    categorie: body.categorie ?? '',
    date: body.date ? new Date(body.date) : new Date(),
  }).returning()
  return c.json(entry, 201)
})

app.delete('/budget/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(budgetEntries).where(and(eq(budgetEntries.id, id), eq(budgetEntries.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
