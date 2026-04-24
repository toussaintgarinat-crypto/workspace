import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { auditMissions, auditDocuments, auditMissionPoles, poles } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// ── Helpers ───────────────────────────────────────────────────

async function getMissionWithPoles(missionId: string, userId: string) {
  const [mission] = await db.select().from(auditMissions)
    .where(and(eq(auditMissions.id, missionId), eq(auditMissions.userId, userId))).limit(1)
  if (!mission) return null
  const missionPoles = await db
    .select({ id: poles.id, nom: poles.nom, emoji: poles.emoji, couleur: poles.couleur, type: poles.type })
    .from(auditMissionPoles)
    .innerJoin(poles, eq(auditMissionPoles.poleId, poles.id))
    .where(eq(auditMissionPoles.missionId, missionId))
  return { ...mission, poles: missionPoles }
}

// ── Missions ──────────────────────────────────────────────────

app.get('/poles/:poleId/audit', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const list = await db.select().from(auditMissions)
    .where(and(eq(auditMissions.poleId, poleId), eq(auditMissions.userId, user.sub)))
    .orderBy(desc(auditMissions.createdAt))

  const withPoles = await Promise.all(list.map(m => getMissionWithPoles(m.id, user.sub)))
  return c.json(withPoles.filter(Boolean))
})

app.post('/poles/:poleId/audit', zValidator('json', z.object({
  titre:       z.string().min(1).max(300),
  description: z.string().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')

  const [mission] = await db.insert(auditMissions).values({
    poleId, userId: user.sub,
    titre: body.titre,
    description: body.description ?? '',
  }).returning()

  // Auto-associer tous les pôles de la même venture
  const [sourcePole] = await db.select().from(poles).where(eq(poles.id, poleId)).limit(1)
  const allPoles = sourcePole?.ventureId
    ? await db.select().from(poles).where(eq(poles.ventureId, sourcePole.ventureId))
    : [sourcePole]

  if (allPoles.length > 0) {
    await db.insert(auditMissionPoles).values(
      allPoles.filter(Boolean).map(p => ({ missionId: mission.id, poleId: p.id }))
    ).onConflictDoNothing()
  }

  return c.json(await getMissionWithPoles(mission.id, user.sub), 201)
})

app.patch('/audit/:id', zValidator('json', z.object({
  titre:       z.string().optional(),
  description: z.string().optional(),
  statut:      z.enum(['brouillon', 'actif', 'termine']).optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.titre)                       updates.titre = body.titre
  if (body.description !== undefined)   updates.description = body.description
  if (body.statut)                      updates.statut = body.statut
  const [mission] = await db.update(auditMissions).set(updates)
    .where(and(eq(auditMissions.id, id), eq(auditMissions.userId, user.sub)))
    .returning()
  if (!mission) return c.json({ error: 'Not found' }, 404)
  return c.json(await getMissionWithPoles(id, user.sub))
})

app.delete('/audit/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(auditMissions).where(and(eq(auditMissions.id, id), eq(auditMissions.userId, user.sub)))
  return c.json({ ok: true })
})

// ── Pôles d'une mission ───────────────────────────────────────

app.delete('/audit/:missionId/poles/:poleId', async (c) => {
  const { missionId, poleId } = c.req.param()
  const user = c.get('user')
  const [mission] = await db.select().from(auditMissions)
    .where(and(eq(auditMissions.id, missionId), eq(auditMissions.userId, user.sub))).limit(1)
  if (!mission) return c.json({ error: 'Not found' }, 404)
  await db.delete(auditMissionPoles)
    .where(and(eq(auditMissionPoles.missionId, missionId), eq(auditMissionPoles.poleId, poleId)))
  return c.json({ ok: true })
})

// ── Documents ─────────────────────────────────────────────────

app.get('/audit/:missionId/documents', async (c) => {
  const { missionId } = c.req.param()
  const user = c.get('user')
  const list = await db.select().from(auditDocuments)
    .where(and(eq(auditDocuments.missionId, missionId), eq(auditDocuments.userId, user.sub)))
    .orderBy(desc(auditDocuments.createdAt))
  return c.json(list)
})

app.post('/audit/:missionId/documents', zValidator('json', z.object({
  nom:     z.string().min(1),
  type:    z.string().optional(),
  contenu: z.string(),
  analyse: z.string().optional(),
})), async (c) => {
  const { missionId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [doc] = await db.insert(auditDocuments).values({
    missionId, userId: user.sub,
    nom: body.nom,
    type: body.type ?? 'pdf',
    contenu: body.contenu,
    analyse: body.analyse ?? '',
  }).returning()
  return c.json(doc, 201)
})

app.delete('/audit/documents/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(auditDocuments).where(and(eq(auditDocuments.id, id), eq(auditDocuments.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
