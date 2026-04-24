import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { teamMembers } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/team', async (c) => {
  const orgId = c.req.header('X-Org-ID')
  if (!orgId) return c.json([])
  const members = await db.select().from(teamMembers)
    .where(eq(teamMembers.orgId, orgId))
    .orderBy(desc(teamMembers.createdAt))
  return c.json(members)
})

app.post('/team', zValidator('json', z.object({
  nom:    z.string().min(1).max(200),
  email:  z.string().email().optional(),
  role:   z.enum(['founder', 'admin', 'agent', 'viewer']).optional(),
  poles:  z.array(z.string()).optional(),
  statut: z.enum(['actif', 'invite', 'inactif']).optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  if (!orgId) return c.json({ error: 'X-Org-ID required' }, 400)
  const body = c.req.valid('json')
  const [member] = await db.insert(teamMembers).values({
    orgId, userId: user.sub,
    nom: body.nom, email: body.email ?? '',
    role: body.role ?? 'viewer',
    poles: JSON.stringify(body.poles ?? []),
    statut: body.statut ?? 'invite',
  }).returning()
  return c.json(member, 201)
})

app.patch('/team/:id', zValidator('json', z.object({
  nom:    z.string().optional(),
  role:   z.enum(['founder', 'admin', 'agent', 'viewer']).optional(),
  poles:  z.array(z.string()).optional(),
  statut: z.enum(['actif', 'invite', 'inactif']).optional(),
})), async (c) => {
  const { id } = c.req.param()
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const update: any = { ...body }
  if (body.poles) update.poles = JSON.stringify(body.poles)
  const [member] = await db.update(teamMembers).set(update)
    .where(and(eq(teamMembers.id, id), orgId ? eq(teamMembers.orgId, orgId) : eq(teamMembers.id, id)))
    .returning()
  return c.json(member)
})

app.delete('/team/:id', async (c) => {
  const { id } = c.req.param()
  const orgId = c.req.header('X-Org-ID')
  await db.delete(teamMembers)
    .where(and(eq(teamMembers.id, id), orgId ? eq(teamMembers.orgId, orgId) : eq(teamMembers.id, id)))
  return c.json({ ok: true })
})

export default app
