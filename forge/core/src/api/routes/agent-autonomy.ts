import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { agentAutonomyRules, agentFeedback, agentRuns, agentScores } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// ── Autonomy Rules ────────────────────────────────────────────
app.get('/agents/:agentId/autonomy', async (c) => {
  const { agentId } = c.req.param()
  const [rule] = await db.select().from(agentAutonomyRules)
    .where(eq(agentAutonomyRules.agentId, agentId)).limit(1)
  return c.json(rule ?? { niveau: 'N1', horaires: '{}', overrideOk: false })
})

app.put('/agents/:agentId/autonomy', zValidator('json', z.object({
  niveau:     z.enum(['N0', 'N1', 'N2', 'N3']),
  horaires:   z.string().optional(),
  overrideOk: z.boolean().optional(),
})), async (c) => {
  const { agentId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [existing] = await db.select().from(agentAutonomyRules)
    .where(eq(agentAutonomyRules.agentId, agentId)).limit(1)
  if (existing) {
    const [u] = await db.update(agentAutonomyRules)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(agentAutonomyRules.id, existing.id))
      .returning()
    return c.json(u)
  }
  const [created] = await db.insert(agentAutonomyRules).values({
    agentId, userId: user.sub,
    niveau: body.niveau, horaires: body.horaires ?? '{}', overrideOk: body.overrideOk ?? false,
  }).returning()
  return c.json(created, 201)
})

// ── Feedback ──────────────────────────────────────────────────
app.get('/agents/:agentId/feedback', async (c) => {
  const { agentId } = c.req.param()
  const rows = await db.select().from(agentFeedback)
    .where(eq(agentFeedback.agentId, agentId))
    .orderBy(desc(agentFeedback.createdAt))
  const avg = rows.length ? rows.reduce((a, r) => a + (r.rating ?? 3), 0) / rows.length : 0
  return c.json({ rows, avg })
})

app.post('/agents/:agentId/feedback', zValidator('json', z.object({
  rating:      z.number().int().min(1).max(5),
  commentaire: z.string().optional(),
})), async (c) => {
  const { agentId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [fb] = await db.insert(agentFeedback).values({
    agentId, userId: user.sub,
    rating: body.rating, commentaire: body.commentaire ?? '',
  }).returning()
  return c.json(fb, 201)
})

// ── Runs ──────────────────────────────────────────────────────
app.get('/agents/:agentId/runs', async (c) => {
  const { agentId } = c.req.param()
  const runs = await db.select().from(agentRuns)
    .where(eq(agentRuns.agentId, agentId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(100)
  return c.json(runs)
})

app.post('/agents/:agentId/runs', zValidator('json', z.object({
  input:  z.string(),
  poleId: z.string().uuid().optional(),
})), async (c) => {
  const { agentId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [run] = await db.insert(agentRuns).values({
    agentId, userId: user.sub, poleId: body.poleId,
    input: body.input, statut: 'running',
  }).returning()
  return c.json(run, 201)
})

app.patch('/agent-runs/:id', zValidator('json', z.object({
  statut:      z.enum(['running', 'done', 'error', 'cancelled']).optional(),
  output:      z.string().optional(),
  tokensIn:    z.number().int().optional(),
  tokensOut:   z.number().int().optional(),
  dureeMs:     z.number().int().optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [run] = await db.update(agentRuns)
    .set({ ...body, completedAt: body.statut && body.statut !== 'running' ? new Date() : undefined })
    .where(and(eq(agentRuns.id, id), eq(agentRuns.userId, user.sub)))
    .returning()
  return c.json(run)
})

// ── Scores ────────────────────────────────────────────────────
app.get('/agents/:agentId/score', async (c) => {
  const { agentId } = c.req.param()
  const [score] = await db.select().from(agentScores)
    .where(eq(agentScores.agentId, agentId)).limit(1)
  return c.json(score ?? { confianceScore: 0, riskLevel: 'faible', retroFeedback: '' })
})

app.put('/agents/:agentId/score', zValidator('json', z.object({
  confianceScore: z.number().min(0).max(100).optional(),
  riskLevel:      z.enum(['faible', 'moyen', 'eleve']).optional(),
  retroFeedback:  z.string().optional(),
})), async (c) => {
  const { agentId } = c.req.param()
  const body = c.req.valid('json')
  const [existing] = await db.select().from(agentScores)
    .where(eq(agentScores.agentId, agentId)).limit(1)
  if (existing) {
    const [u] = await db.update(agentScores)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(agentScores.id, existing.id))
      .returning()
    return c.json(u)
  }
  const [created] = await db.insert(agentScores).values({ agentId, ...body }).returning()
  return c.json(created, 201)
})

export default app
