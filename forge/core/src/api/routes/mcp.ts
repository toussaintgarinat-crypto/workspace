import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { mcpServers } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { listMCPTools, callMCPTool } from '@/mcp/client'
import { authMiddleware } from '@/api/middleware/auth'
import { metrics } from '@/metrics'
import type { JWTPayload } from '@/api/middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()
app.use('*', authMiddleware)

function scopeFilter(user: JWTPayload, poleId?: string, ventureId?: string) {
  if (poleId)     return and(eq(mcpServers.userId, user.sub), eq(mcpServers.poleId, poleId))
  if (ventureId)  return and(eq(mcpServers.userId, user.sub), eq(mcpServers.ventureId, ventureId), isNull(mcpServers.poleId))
  return and(eq(mcpServers.userId, user.sub), isNull(mcpServers.ventureId), isNull(mcpServers.poleId))
}

app.get('/mcp/servers', async (c) => {
  const user = c.get('user')
  const poleId    = c.req.query('poleId')
  const ventureId = c.req.query('ventureId')
  const servers = await db.select().from(mcpServers).where(scopeFilter(user, poleId, ventureId))
  return c.json(servers.map(s => ({ ...s, authToken: s.authToken ? '***' : '' })))
})

app.post('/mcp/servers', zValidator('json', z.object({
  nom:       z.string().min(1).max(100),
  url:       z.string().url(),
  authType:  z.enum(['none', 'bearer', 'basic']).default('none'),
  authToken: z.string().default(''),
  ventureId: z.string().uuid().optional(),
  poleId:    z.string().uuid().optional(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [server] = await db.insert(mcpServers).values({ userId: user.sub, ...body }).returning()
  return c.json({ ...server, authToken: '' }, 201)
})

app.patch('/mcp/servers/:id', zValidator('json', z.object({
  nom:       z.string().optional(),
  url:       z.string().url().optional(),
  actif:     z.boolean().optional(),
  authType:  z.enum(['none', 'bearer', 'basic']).optional(),
  authToken: z.string().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [server] = await db.update(mcpServers).set(body)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.sub))).returning()
  return c.json(server)
})

app.delete('/mcp/servers/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(mcpServers).where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.sub)))
  return c.json({ ok: true })
})

app.get('/mcp/servers/:id/tools', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [server] = await db.select().from(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.sub)))
  if (!server) return c.json({ error: 'Not found' }, 404)
  return c.json(await listMCPTools(server as any))
})

app.post('/mcp/servers/:id/call', zValidator('json', z.object({
  tool: z.string(),
  args: z.record(z.any()).default({}),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [server] = await db.select().from(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, user.sub)))
  if (!server) return c.json({ error: 'Not found' }, 404)
  metrics.mcp_calls_total++
  return c.json({ result: await callMCPTool(server as any, body.tool, body.args) })
})

export default app
