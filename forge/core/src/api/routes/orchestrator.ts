import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { orchestratorSessions, agentDefinitions } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/orchestrator/sessions', async (c) => {
  const user = c.get('user')
  const sessions = await db.select().from(orchestratorSessions)
    .where(eq(orchestratorSessions.userId, user.sub))
    .orderBy(desc(orchestratorSessions.createdAt))
  return c.json(sessions)
})

app.post('/orchestrator/sessions', zValidator('json', z.object({
  titre:  z.string().min(1),
  poleId: z.string().uuid().optional(),
  agents: z.array(z.string()).optional(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [session] = await db.insert(orchestratorSessions).values({
    userId: user.sub, poleId: body.poleId,
    titre: body.titre, agents: JSON.stringify(body.agents ?? []),
    statut: 'actif',
  }).returning()
  return c.json(session, 201)
})

app.patch('/orchestrator/sessions/:id', zValidator('json', z.object({
  statut: z.enum(['actif', 'termine', 'erreur']).optional(),
  output: z.string().optional(),
  agents: z.array(z.string()).optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const update: any = { ...body, updatedAt: new Date() }
  if (body.agents) update.agents = JSON.stringify(body.agents)
  const [session] = await db.update(orchestratorSessions).set(update)
    .where(and(eq(orchestratorSessions.id, id), eq(orchestratorSessions.userId, user.sub)))
    .returning()
  return c.json(session)
})

app.delete('/orchestrator/sessions/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(orchestratorSessions)
    .where(and(eq(orchestratorSessions.id, id), eq(orchestratorSessions.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
