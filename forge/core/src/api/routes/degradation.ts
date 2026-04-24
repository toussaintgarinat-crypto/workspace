import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { degradationModes, degradationEpisodes } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/degradation', async (c) => {
  const orgId = c.req.header('X-Org-ID')
  const modes = await db.select().from(degradationModes)
    .where(orgId ? eq(degradationModes.orgId, orgId) : sql`1=1`)
  return c.json(modes)
})

app.post('/degradation', zValidator('json', z.object({
  ressource: z.string().min(1),
  actif:     z.boolean().optional(),
  graceMode: z.boolean().optional(),
})), async (c) => {
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [mode] = await db.insert(degradationModes).values({
    orgId: orgId ?? undefined,
    ressource: body.ressource, actif: body.actif ?? false, graceMode: body.graceMode ?? false,
  }).returning()
  return c.json(mode, 201)
})

app.patch('/degradation/:id', zValidator('json', z.object({
  actif:     z.boolean().optional(),
  graceMode: z.boolean().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [mode] = await db.update(degradationModes).set(body)
    .where(and(eq(degradationModes.id, id), orgId ? eq(degradationModes.orgId, orgId) : sql`1=1`))
    .returning()
  return c.json(mode)
})

app.post('/degradation/:id/episodes', zValidator('json', z.object({
  dureeMinutes: z.number().int(),
  raison:       z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const body = c.req.valid('json')
  const [ep] = await db.insert(degradationEpisodes).values({
    modeId: id, dureeMinutes: body.dureeMinutes, raison: body.raison ?? '',
  }).returning()
  return c.json(ep, 201)
})

app.get('/degradation/:id/episodes', async (c) => {
  const { id } = c.req.param()
  const eps = await db.select().from(degradationEpisodes)
    .where(eq(degradationEpisodes.modeId, id))
    .orderBy(desc(degradationEpisodes.createdAt))
  return c.json(eps)
})

export default app
