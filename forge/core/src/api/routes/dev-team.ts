import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { devTasks } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/dev-team', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const statut = c.req.query('statut')
  const rows = await db.select().from(devTasks)
    .where(and(
      eq(devTasks.userId, user.sub),
      orgId ? eq(devTasks.orgId, orgId) : sql`1=1`,
      statut ? eq(devTasks.statut, statut as any) : sql`1=1`,
    ))
    .orderBy(desc(devTasks.createdAt))
  return c.json(rows)
})

app.post('/dev-team', zValidator('json', z.object({
  titre:       z.string().min(1).max(300),
  description: z.string().optional(),
  type:        z.enum(['bug', 'feature', 'chore', 'doc', 'refactor']).optional(),
  statut:      z.enum(['backlog', 'todo', 'en_cours', 'review', 'done']).optional(),
  priorite:    z.enum(['haute', 'normale', 'basse']).optional(),
  poleId:      z.string().uuid().optional(),
  agentIA:     z.string().optional(),
  tempsEstime: z.number().int().optional(),
  assigneA:    z.string().optional(),
  deadline:    z.string().optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [task] = await db.insert(devTasks).values({
    userId: user.sub, orgId: orgId ?? undefined,
    poleId: body.poleId,
    titre: body.titre, description: body.description ?? '',
    type: body.type ?? 'feature', statut: body.statut ?? 'backlog',
    priorite: body.priorite ?? 'normale',
    agentIA: body.agentIA ?? '', tempsEstime: body.tempsEstime ?? 0,
    assigneA: body.assigneA ?? '',
    deadline: body.deadline ? new Date(body.deadline) : undefined,
  }).returning()
  return c.json(task, 201)
})

app.patch('/dev-team/:id', zValidator('json', z.object({
  titre:       z.string().optional(),
  description: z.string().optional(),
  type:        z.enum(['bug', 'feature', 'chore', 'doc', 'refactor']).optional(),
  statut:      z.enum(['backlog', 'todo', 'en_cours', 'review', 'done']).optional(),
  priorite:    z.enum(['haute', 'normale', 'basse']).optional(),
  agentIA:     z.string().optional(),
  analyseLLM:  z.string().optional(),
  assigneA:    z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [task] = await db.update(devTasks)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(devTasks.id, id), eq(devTasks.userId, user.sub)))
    .returning()
  return c.json(task)
})

app.delete('/dev-team/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(devTasks)
    .where(and(eq(devTasks.id, id), eq(devTasks.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
