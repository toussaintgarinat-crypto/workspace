import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { templates } from '../../db/schema'
import { eq, and, desc, or, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/templates', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const type = c.req.query('type')
  const rows = await db.select().from(templates)
    .where(and(
      or(eq(templates.userId, user.sub), eq(templates.public, true)),
      orgId ? or(eq(templates.orgId, orgId), eq(templates.public, true)) : sql`1=1`,
      type ? eq(templates.type, type as any) : sql`1=1`,
    ))
    .orderBy(desc(templates.createdAt))
  return c.json(rows)
})

app.post('/templates', zValidator('json', z.object({
  nom:         z.string().min(1).max(200),
  description: z.string().optional(),
  type:        z.enum(['contrat', 'email', 'rapport', 'brief', 'autre']).optional(),
  contenu:     z.string().min(1),
  variables:   z.array(z.string()).optional(),
  public:      z.boolean().optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [tmpl] = await db.insert(templates).values({
    userId: user.sub, orgId: orgId ?? undefined,
    nom: body.nom, description: body.description ?? '',
    type: body.type ?? 'autre', contenu: body.contenu,
    variables: JSON.stringify(body.variables ?? []),
    public: body.public ?? false,
  }).returning()
  return c.json(tmpl, 201)
})

app.patch('/templates/:id', zValidator('json', z.object({
  nom:         z.string().optional(),
  description: z.string().optional(),
  contenu:     z.string().optional(),
  variables:   z.array(z.string()).optional(),
  public:      z.boolean().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const update: any = { ...body, updatedAt: new Date() }
  if (body.variables) update.variables = JSON.stringify(body.variables)
  const [tmpl] = await db.update(templates).set(update)
    .where(and(eq(templates.id, id), eq(templates.userId, user.sub)))
    .returning()
  return c.json(tmpl)
})

app.delete('/templates/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
