import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { taskDagItems } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/poles/:poleId/dag', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const items = await db.select().from(taskDagItems)
    .where(and(eq(taskDagItems.poleId, poleId), eq(taskDagItems.userId, user.sub)))
    .orderBy(desc(taskDagItems.createdAt))
  return c.json(items)
})

app.post('/poles/:poleId/dag', zValidator('json', z.object({
  nom:         z.string().min(1).max(200),
  description: z.string().optional(),
  agentOwner:  z.string().optional(),
  dependances: z.array(z.string()).optional(),
  criticite:   z.enum(['faible', 'normale', 'haute', 'critique']).optional(),
  nodeType:    z.enum(['agent', 'prompt']).optional(),
  posX:        z.number().optional(),
  posY:        z.number().optional(),
  promptText:  z.string().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [item] = await db.insert(taskDagItems).values({
    poleId, userId: user.sub,
    nom: body.nom, description: body.description ?? '',
    agentOwner: body.agentOwner ?? '',
    dependances: JSON.stringify(body.dependances ?? []),
    criticite: body.criticite ?? 'normale',
    nodeType:  body.nodeType ?? 'agent',
    posX:      body.posX ?? 0,
    posY:      body.posY ?? 0,
    promptText: body.promptText ?? '',
  }).returning()
  return c.json(item, 201)
})

app.patch('/dag/:id', zValidator('json', z.object({
  nom:         z.string().optional(),
  statut:      z.enum(['pending', 'running', 'done', 'error']).optional(),
  agentOwner:  z.string().optional(),
  dependances: z.array(z.string()).optional(),
  criticite:   z.enum(['faible', 'normale', 'haute', 'critique']).optional(),
  nodeType:    z.enum(['agent', 'prompt']).optional(),
  posX:        z.number().optional(),
  posY:        z.number().optional(),
  promptText:  z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const update: any = { ...body, updatedAt: new Date() }
  if (body.dependances) update.dependances = JSON.stringify(body.dependances)
  const [item] = await db.update(taskDagItems).set(update)
    .where(and(eq(taskDagItems.id, id), eq(taskDagItems.userId, user.sub)))
    .returning()
  return c.json(item)
})

app.delete('/dag/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(taskDagItems)
    .where(and(eq(taskDagItems.id, id), eq(taskDagItems.userId, user.sub)))
  return c.json({ ok: true })
})

// Topological sort (Kahn) + background execution
app.post('/poles/:poleId/dag/run', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')

  const items = await db.select().from(taskDagItems)
    .where(and(eq(taskDagItems.poleId, poleId), eq(taskDagItems.userId, user.sub)))

  if (items.length === 0) return c.json({ ok: true, order: [] })

  // Build graph
  const inDegree: Record<string, number> = {}
  const adj: Record<string, string[]>    = {}
  for (const t of items) { inDegree[t.id] = 0; adj[t.id] = [] }
  for (const t of items) {
    const deps: string[] = JSON.parse(t.dependances || '[]')
    for (const dep of deps) {
      if (adj[dep]) { adj[dep].push(t.id); inDegree[t.id]++ }
    }
  }

  // Kahn's algorithm
  const queue = items.filter(t => inDegree[t.id] === 0).map(t => t.id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of adj[id]) { if (--inDegree[next] === 0) queue.push(next) }
  }

  // Reset all to pending
  await db.update(taskDagItems).set({ statut: 'pending', updatedAt: new Date() })
    .where(and(eq(taskDagItems.poleId, poleId), eq(taskDagItems.userId, user.sub)))

  // Execute in background (don't block response)
  ;(async () => {
    for (const id of order) {
      await db.update(taskDagItems).set({ statut: 'running', updatedAt: new Date() })
        .where(and(eq(taskDagItems.id, id), eq(taskDagItems.userId, user.sub)))
      await new Promise(r => setTimeout(r, 900))
      await db.update(taskDagItems).set({ statut: 'done', updatedAt: new Date() })
        .where(and(eq(taskDagItems.id, id), eq(taskDagItems.userId, user.sub)))
    }
  })()

  return c.json({ ok: true, order })
})

export default app
