import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { crmLeads } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/poles/:poleId/crm', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const statut = c.req.query('statut')
  const conditions = [eq(crmLeads.poleId, poleId), eq(crmLeads.userId, user.sub)]
  if (statut) conditions.push(eq(crmLeads.statut, statut as any))
  const list = await db.select().from(crmLeads)
    .where(and(...conditions))
    .orderBy(desc(crmLeads.updatedAt))
  return c.json(list)
})

app.post('/poles/:poleId/crm', zValidator('json', z.object({
  nom:        z.string().min(1).max(200),
  email:      z.string().email().optional().or(z.literal('')),
  telephone:  z.string().optional(),
  entreprise: z.string().optional(),
  statut:     z.enum(['prospect', 'qualifie', 'gagne', 'perdu']).optional(),
  valeur:     z.number().int().optional(),
  notes:      z.string().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [lead] = await db.insert(crmLeads).values({
    poleId, userId: user.sub,
    nom: body.nom,
    email: body.email ?? '',
    telephone: body.telephone ?? '',
    entreprise: body.entreprise ?? '',
    statut: body.statut ?? 'prospect',
    valeur: body.valeur ?? 0,
    notes: body.notes ?? '',
  }).returning()
  return c.json(lead, 201)
})

app.patch('/crm/:id', zValidator('json', z.object({
  nom:        z.string().optional(),
  email:      z.string().optional(),
  telephone:  z.string().optional(),
  entreprise: z.string().optional(),
  statut:     z.enum(['prospect', 'qualifie', 'gagne', 'perdu']).optional(),
  valeur:     z.number().int().optional(),
  notes:      z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  Object.entries(body).forEach(([k, v]) => { if (v !== undefined) updates[k] = v })
  const [lead] = await db.update(crmLeads).set(updates)
    .where(and(eq(crmLeads.id, id), eq(crmLeads.userId, user.sub)))
    .returning()
  if (!lead) return c.json({ error: 'Not found' }, 404)
  return c.json(lead)
})

app.delete('/crm/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(crmLeads).where(and(eq(crmLeads.id, id), eq(crmLeads.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
