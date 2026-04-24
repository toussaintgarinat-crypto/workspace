import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { agendaEvents } from '../../db/schema'
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/calendar/events', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const debut = c.req.query('debut')
  const fin = c.req.query('fin')
  const events = await db.select().from(agendaEvents)
    .where(and(
      eq(agendaEvents.userId, user.sub),
      orgId ? eq(agendaEvents.orgId, orgId) : sql`1=1`,
      debut ? gte(agendaEvents.dateDebut, new Date(debut)) : sql`1=1`,
      fin ? lte(agendaEvents.dateDebut, new Date(fin)) : sql`1=1`,
    ))
    .orderBy(desc(agendaEvents.dateDebut))
  return c.json(events)
})

app.post('/calendar/events', zValidator('json', z.object({
  titre:       z.string().min(1).max(300),
  description: z.string().optional(),
  dateDebut:   z.string(),
  dateFin:     z.string().optional(),
  pole:        z.string().optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [event] = await db.insert(agendaEvents).values({
    userId: user.sub, orgId: orgId ?? undefined,
    titre: body.titre, description: body.description ?? '',
    dateDebut: new Date(body.dateDebut),
    dateFin: body.dateFin ? new Date(body.dateFin) : undefined,
    pole: body.pole ?? '',
  }).returning()
  return c.json(event, 201)
})

app.patch('/calendar/events/:id', zValidator('json', z.object({
  titre:       z.string().optional(),
  description: z.string().optional(),
  dateDebut:   z.string().optional(),
  dateFin:     z.string().optional(),
  pole:        z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const update: any = { ...body }
  if (body.dateDebut) update.dateDebut = new Date(body.dateDebut)
  if (body.dateFin) update.dateFin = new Date(body.dateFin)
  const [event] = await db.update(agendaEvents).set(update)
    .where(and(eq(agendaEvents.id, id), eq(agendaEvents.userId, user.sub)))
    .returning()
  return c.json(event)
})

app.delete('/calendar/events/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(agendaEvents)
    .where(and(eq(agendaEvents.id, id), eq(agendaEvents.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
