import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { riskLogs } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

const FAST_PATH_WHITELIST = ['read', 'list', 'search', 'get', 'export_csv']

function scoreAction(action: string): { score: number; niveau: 'faible' | 'moyen' | 'eleve' | 'critique' } {
  const lower = action.toLowerCase()
  if (FAST_PATH_WHITELIST.some(k => lower.includes(k))) return { score: 5, niveau: 'faible' }
  if (lower.includes('delete') || lower.includes('supprimer')) return { score: 85, niveau: 'eleve' }
  if (lower.includes('deploy') || lower.includes('stripe') || lower.includes('email_send')) return { score: 70, niveau: 'eleve' }
  if (lower.includes('create') || lower.includes('update')) return { score: 35, niveau: 'moyen' }
  if (lower.includes('purge') || lower.includes('drop') || lower.includes('truncate')) return { score: 95, niveau: 'critique' }
  return { score: 20, niveau: 'faible' }
}

app.post('/risk-engine/score', zValidator('json', z.object({
  action: z.string(),
  poleId: z.string().uuid().optional(),
  contexte: z.string().optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const { action, poleId, contexte } = c.req.valid('json')
  const { score, niveau } = scoreAction(action)
  const fastPath = score <= 15
  const [log] = await db.insert(riskLogs).values({
    userId: user.sub, orgId: orgId ?? undefined,
    poleId, action, score, niveau, fastPath, approuve: fastPath,
    raison: contexte ?? '',
  }).returning()
  return c.json({ ...log, fastPath, recommande: fastPath ? 'proceed' : score >= 70 ? 'block' : 'review' })
})

app.get('/risk-engine/logs', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const logs = await db.select().from(riskLogs)
    .where(and(eq(riskLogs.userId, user.sub), orgId ? eq(riskLogs.orgId, orgId) : sql`1=1`))
    .orderBy(desc(riskLogs.createdAt))
    .limit(200)
  return c.json(logs)
})

app.patch('/risk-engine/logs/:id/approuve', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [log] = await db.update(riskLogs).set({ approuve: true })
    .where(and(eq(riskLogs.id, id), eq(riskLogs.userId, user.sub)))
    .returning()
  return c.json(log)
})

export default app
