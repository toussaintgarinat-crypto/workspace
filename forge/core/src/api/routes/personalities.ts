import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { forgePersonalities, agentDefinitions } from '@/db/schema'
import { eq, asc, desc } from 'drizzle-orm'

const app = new Hono()

app.get('/personalities', async (c) => {
  const items = await db.select().from(forgePersonalities)
    .orderBy(desc(forgePersonalities.isBuiltin), asc(forgePersonalities.label))
  return c.json(items)
})

app.post('/personalities', zValidator('json', z.object({
  label:        z.string().min(1),
  emoji:        z.string().optional(),
  description:  z.string().optional(),
  systemPrompt: z.string().optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const [p] = await db.insert(forgePersonalities).values({
    label:        body.label,
    emoji:        body.emoji        ?? '🤖',
    description:  body.description  ?? '',
    systemPrompt: body.systemPrompt ?? '',
    isBuiltin:    0,
  }).returning()
  return c.json(p, 201)
})

app.put('/personalities/:id', zValidator('json', z.object({
  label:        z.string().min(1).optional(),
  emoji:        z.string().optional(),
  description:  z.string().optional(),
  systemPrompt: z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const body    = c.req.valid('json')
  const [p] = await db.update(forgePersonalities)
    .set({
      ...(body.label        !== undefined && { label:        body.label }),
      ...(body.emoji        !== undefined && { emoji:        body.emoji }),
      ...(body.description  !== undefined && { description:  body.description }),
      ...(body.systemPrompt !== undefined && { systemPrompt: body.systemPrompt }),
    })
    .where(eq(forgePersonalities.id, id))
    .returning()
  if (!p) return c.json({ error: 'Not found' }, 404)
  return c.json(p)
})

app.delete('/personalities/:id', async (c) => {
  const { id } = c.req.param()
  const [p] = await db.select().from(forgePersonalities).where(eq(forgePersonalities.id, id))
  if (!p)         return c.json({ error: 'Not found' }, 404)
  if (p.isBuiltin) return c.json({ error: 'Cannot delete a builtin personality' }, 400)
  await db.update(agentDefinitions).set({ personalityId: null }).where(eq(agentDefinitions.personalityId, id))
  await db.delete(forgePersonalities).where(eq(forgePersonalities.id, id))
  return c.json({ ok: true })
})

export default app
