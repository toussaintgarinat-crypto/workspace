import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { stagingProposals } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/staging', async (c) => {
  const orgId = c.req.header('X-Org-ID')
  const rows = await db.select().from(stagingProposals)
    .where(orgId ? eq(stagingProposals.orgId, orgId) : sql`1=1`)
    .orderBy(desc(stagingProposals.createdAt))
  return c.json(rows)
})

app.post('/staging', zValidator('json', z.object({
  contenu:  z.string().min(1),
  scoreMea: z.number().optional(),
})), async (c) => {
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [proposal] = await db.insert(stagingProposals).values({
    orgId: orgId ?? undefined,
    contenu: body.contenu, scoreMea: body.scoreMea ?? 0,
  }).returning()
  return c.json(proposal, 201)
})

app.patch('/staging/:id', zValidator('json', z.object({
  statut:   z.enum(['pending', 'approuve', 'rejete']),
  scoreMea: z.number().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [proposal] = await db.update(stagingProposals).set(body)
    .where(and(eq(stagingProposals.id, id), orgId ? eq(stagingProposals.orgId, orgId) : sql`1=1`))
    .returning()
  return c.json(proposal)
})

export default app
