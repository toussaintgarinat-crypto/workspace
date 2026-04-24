import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { skills } from '@/db/schema'
import { eq, and, or, isNull } from 'drizzle-orm'
import { authMiddleware } from '@/api/middleware/auth'
import type { JWTPayload } from '@/api/middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()
app.use('*', authMiddleware)

function scopeFilter(user: JWTPayload, poleId?: string, ventureId?: string) {
  if (poleId)    return and(eq(skills.userId, user.sub), eq(skills.poleId, poleId))
  if (ventureId) return and(eq(skills.userId, user.sub), eq(skills.ventureId, ventureId), isNull(skills.poleId))
  return and(or(eq(skills.userId, user.sub), eq(skills.global, true)), isNull(skills.ventureId), isNull(skills.poleId))
}

app.get('/skills', async (c) => {
  const user = c.get('user')
  const poleId    = c.req.query('poleId')
  const ventureId = c.req.query('ventureId')
  return c.json(await db.select().from(skills).where(scopeFilter(user, poleId, ventureId)))
})

app.get('/skills/active', async (c) => {
  const user = c.get('user')
  const poleId    = c.req.query('poleId')
  const ventureId = c.req.query('ventureId')
  return c.json(await db.select().from(skills).where(
    and(scopeFilter(user, poleId, ventureId), eq(skills.actif, true))
  ))
})

app.post('/skills', zValidator('json', z.object({
  nom:         z.string().min(1).max(200),
  description: z.string().default(''),
  tags:        z.array(z.string()).default([]),
  skillMd:     z.string().min(1),
  actif:       z.boolean().default(true),
  ventureId:   z.string().uuid().optional(),
  poleId:      z.string().uuid().optional(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [skill] = await db.insert(skills).values({
    userId: user.sub,
    nom:         body.nom,
    description: body.description,
    tags:        JSON.stringify(body.tags),
    skillMd:     body.skillMd,
    actif:       body.actif,
    ventureId:   body.ventureId ?? null,
    poleId:      body.poleId ?? null,
  }).returning()
  return c.json(skill, 201)
})

app.patch('/skills/:id', zValidator('json', z.object({
  nom:         z.string().optional(),
  description: z.string().optional(),
  actif:       z.boolean().optional(),
  skillMd:     z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [skill] = await db.update(skills)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(skills.id, id), eq(skills.userId, user.sub)))
    .returning()
  if (!skill) return c.json({ error: 'Not found' }, 404)
  return c.json(skill)
})

app.delete('/skills/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(skills).where(and(eq(skills.id, id), eq(skills.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
