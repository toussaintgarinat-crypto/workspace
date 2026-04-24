import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { contrats } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/poles/:poleId/contrats', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const list = await db.select().from(contrats)
    .where(and(eq(contrats.poleId, poleId), eq(contrats.userId, user.sub)))
    .orderBy(desc(contrats.createdAt))
  return c.json(list)
})

app.post('/poles/:poleId/contrats', zValidator('json', z.object({
  titre:     z.string().min(1).max(300),
  type:      z.string().optional(),
  parties:   z.string().optional(),
  contenu:   z.string().optional(),
  valeur:    z.number().int().optional(),
  dateDebut: z.string().optional(),
  dateFin:   z.string().optional(),
  notes:     z.string().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [contrat] = await db.insert(contrats).values({
    poleId, userId: user.sub,
    titre: body.titre,
    type: body.type ?? 'Autre',
    parties: body.parties ?? '',
    contenu: body.contenu ?? '',
    valeur: body.valeur ?? 0,
    dateDebut: body.dateDebut ?? '',
    dateFin: body.dateFin ?? '',
    notes: body.notes ?? '',
  }).returning()
  return c.json(contrat, 201)
})

app.patch('/contrats/:id', zValidator('json', z.object({
  titre:     z.string().optional(),
  type:      z.string().optional(),
  statut:    z.enum(['brouillon', 'actif', 'signe', 'expire', 'resilie']).optional(),
  parties:   z.string().optional(),
  contenu:   z.string().optional(),
  valeur:    z.number().int().optional(),
  dateDebut: z.string().optional(),
  dateFin:   z.string().optional(),
  notes:     z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  Object.entries(body).forEach(([k, v]) => { if (v !== undefined) updates[k] = v })
  const [contrat] = await db.update(contrats).set(updates)
    .where(and(eq(contrats.id, id), eq(contrats.userId, user.sub)))
    .returning()
  if (!contrat) return c.json({ error: 'Not found' }, 404)
  return c.json(contrat)
})

app.post('/contrats/:id/signer', zValidator('json', z.object({
  signePar: z.string().min(1),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const { signePar } = c.req.valid('json')
  const [contrat] = await db.update(contrats).set({
    statut: 'signe', signePar, signeAt: new Date(), updatedAt: new Date()
  }).where(and(eq(contrats.id, id), eq(contrats.userId, user.sub))).returning()
  if (!contrat) return c.json({ error: 'Not found' }, 404)
  return c.json(contrat)
})

app.delete('/contrats/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(contrats).where(and(eq(contrats.id, id), eq(contrats.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
