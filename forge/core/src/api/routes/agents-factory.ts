import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { agentDefinitions } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/agent-factory', async (c) => {
  const user = c.get('user')
  const statut = c.req.query('statut')
  const niveau = c.req.query('niveau')
  let where: any = eq(agentDefinitions.userId, user.sub)
  if (statut) where = and(where, eq(agentDefinitions.statut, statut as any))
  if (niveau) where = and(where, eq(agentDefinitions.niveau, niveau as any))
  const items = await db.select().from(agentDefinitions).where(where).orderBy(desc(agentDefinitions.createdAt))
  const [stats] = await db.select({
    total:   sql<number>`count(*)`,
    actifs:  sql<number>`count(*) filter (where statut = 'active')`,
    drafts:  sql<number>`count(*) filter (where statut = 'draft')`,
  }).from(agentDefinitions).where(eq(agentDefinitions.userId, user.sub))
  return c.json({ items, stats })
})

app.get('/agent-factory/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [a] = await db.select().from(agentDefinitions).where(and(eq(agentDefinitions.id, id), eq(agentDefinitions.userId, user.sub)))
  if (!a) return c.json({ error: 'Not found' }, 404)
  return c.json(a)
})

app.post('/agent-factory', zValidator('json', z.object({
  nom:          z.string().min(1),
  description:  z.string().optional(),
  instructions: z.string().optional(),
  niveau:       z.enum(['local', 'medium', 'api']).default('medium'),
  llmPreset:    z.string().optional(),
  poleId:       z.string().uuid().optional(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [a] = await db.insert(agentDefinitions).values({
    userId:       user.sub,
    nom:          body.nom,
    description:  body.description ?? '',
    instructions: body.instructions ?? '',
    niveau:       body.niveau,
    llmPreset:    body.llmPreset ?? '',
    poleId:       body.poleId ?? null,
    statut:       'draft',
  }).returning()
  return c.json(a, 201)
})

app.patch('/agent-factory/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json()
  const [a] = await db.update(agentDefinitions).set({ ...body, updatedAt: new Date() })
    .where(and(eq(agentDefinitions.id, id), eq(agentDefinitions.userId, user.sub))).returning()
  return c.json(a)
})

app.delete('/agent-factory/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(agentDefinitions).where(and(eq(agentDefinitions.id, id), eq(agentDefinitions.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
