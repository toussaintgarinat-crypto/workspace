import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { sprints, tasks } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// ── Sprints ──────────────────────────────────────────────────

app.get('/poles/:poleId/sprints', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const list = await db.select().from(sprints)
    .where(and(eq(sprints.poleId, poleId), eq(sprints.userId, user.sub)))
    .orderBy(desc(sprints.createdAt))
  return c.json(list)
})

app.post('/poles/:poleId/sprints', zValidator('json', z.object({
  nom:      z.string().min(1).max(200),
  objectif: z.string().optional(),
  dateFin:  z.string().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [sprint] = await db.insert(sprints).values({
    poleId, userId: user.sub,
    nom: body.nom,
    objectif: body.objectif ?? '',
    dateFin: body.dateFin ? new Date(body.dateFin) : undefined,
  }).returning()
  return c.json(sprint, 201)
})

app.patch('/sprints/:id', zValidator('json', z.object({
  nom:      z.string().optional(),
  objectif: z.string().optional(),
  statut:   z.enum(['actif', 'termine', 'archive']).optional(),
  dateFin:  z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const updates: Record<string, unknown> = {}
  if (body.nom)     updates.nom = body.nom
  if (body.objectif !== undefined) updates.objectif = body.objectif
  if (body.statut)  updates.statut = body.statut
  if (body.dateFin) updates.dateFin = new Date(body.dateFin)
  const [sprint] = await db.update(sprints).set(updates)
    .where(and(eq(sprints.id, id), eq(sprints.userId, user.sub)))
    .returning()
  if (!sprint) return c.json({ error: 'Not found' }, 404)
  return c.json(sprint)
})

app.delete('/sprints/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(sprints).where(and(eq(sprints.id, id), eq(sprints.userId, user.sub)))
  return c.json({ ok: true })
})

// ── Tasks ────────────────────────────────────────────────────

app.get('/poles/:poleId/tasks', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const sprintId = c.req.query('sprintId')
  const conditions = [eq(tasks.poleId, poleId), eq(tasks.userId, user.sub)]
  if (sprintId) conditions.push(eq(tasks.sprintId, sprintId))
  const list = await db.select().from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
  return c.json(list)
})

app.post('/poles/:poleId/tasks', zValidator('json', z.object({
  titre:       z.string().min(1).max(300),
  description: z.string().optional(),
  sprintId:    z.string().uuid().optional(),
  priorite:    z.enum(['haute', 'normale', 'basse']).optional(),
  assigneA:    z.string().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [task] = await db.insert(tasks).values({
    poleId, userId: user.sub,
    titre: body.titre,
    description: body.description ?? '',
    sprintId: body.sprintId,
    priorite: body.priorite ?? 'normale',
    assigneA: body.assigneA,
  }).returning()
  return c.json(task, 201)
})

app.patch('/tasks/:id', zValidator('json', z.object({
  titre:       z.string().optional(),
  description: z.string().optional(),
  statut:      z.enum(['todo', 'en_cours', 'done']).optional(),
  priorite:    z.enum(['haute', 'normale', 'basse']).optional(),
  assigneA:    z.string().optional(),
  sprintId:    z.string().uuid().nullable().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.titre)       updates.titre = body.titre
  if (body.description !== undefined) updates.description = body.description
  if (body.statut)      updates.statut = body.statut
  if (body.priorite)    updates.priorite = body.priorite
  if (body.assigneA !== undefined) updates.assigneA = body.assigneA
  if (body.sprintId !== undefined) updates.sprintId = body.sprintId
  const [task] = await db.update(tasks).set(updates)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.sub)))
    .returning()
  if (!task) return c.json({ error: 'Not found' }, 404)
  return c.json(task)
})

app.delete('/tasks/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
