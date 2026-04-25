import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { poles, poleMembers, decisionsN0, killSwitches, blackboardEvents, ventures } from '@/db/schema'
import { eq, and, count, desc, inArray } from 'drizzle-orm'
import type { JWTPayload } from '@/api/middleware/auth'

export const commandBridgeRouter = new Hono<{ Variables: { user: JWTPayload } }>()

// ── Overview — état de tous les pôles ───────────────────────
commandBridgeRouter.get('/overview', async (c) => {
  const user = c.get('user') as { sub: string }

  const userPoles = await db.select().from(poles).where(eq(poles.ownerId, user.sub))
  if (!userPoles.length) return c.json({ poles: [], ventures: [], totalDecisions: 0, totalPoles: 0 })

  // Charger les ventures pour enrichir les pôles
  const userVentures = await db.select().from(ventures).where(eq(ventures.ownerId, user.sub))

  const poleIds = userPoles.map(p => p.id)

  // Batch : décisions en attente par pôle
  const decisionCounts = await db
    .select({ poleId: decisionsN0.poleId, nb: count() })
    .from(decisionsN0)
    .where(and(
      eq(decisionsN0.statut, 'en_attente'),
      inArray(decisionsN0.poleId, poleIds)
    ))
    .groupBy(decisionsN0.poleId)

  // Batch : membres par pôle
  const memberCounts = await db
    .select({ poleId: poleMembers.poleId, nb: count() })
    .from(poleMembers)
    .where(inArray(poleMembers.poleId, poleIds))
    .groupBy(poleMembers.poleId)

  // Kill switches
  const switches = await db.select().from(killSwitches)
    .where(inArray(killSwitches.poleId, poleIds))

  const decMap: Record<string, number> = Object.fromEntries(decisionCounts.map(d => [d.poleId, Number(d.nb)]))
  const memberMap = Object.fromEntries(memberCounts.map(m => [m.poleId, Number(m.nb)]))
  const switchMap = Object.fromEntries(switches.map(s => [s.poleId, s.enPause]))

  const ventureMap = Object.fromEntries(userVentures.map(v => [v.id, v]))

  const polesData = userPoles.map(p => ({
    id:          p.id,
    nom:         p.nom,
    emoji:       p.emoji,
    couleur:     p.couleur,
    ventureId:   p.ventureId ?? null,
    ventureNom:  p.ventureId ? (ventureMap[p.ventureId]?.nom ?? null) : null,
    ventureEmoji: p.ventureId ? (ventureMap[p.ventureId]?.emoji ?? null) : null,
    nbMembres:   memberMap[p.id] ?? 0,
    nbDecisions: decMap[p.id]    ?? 0,
    enPause:     switchMap[p.id] ?? false,
  }))

  return c.json({
    poles:          polesData,
    ventures:       userVentures.map(v => ({ id: v.id, nom: v.nom, emoji: v.emoji, couleur: v.couleur, type: v.type })),
    totalDecisions: Object.values(decMap).reduce((a: number, b: number) => a + b, 0),
    totalPoles:     userPoles.length,
  })
})

// ── Décisions N0 — liste ─────────────────────────────────────
commandBridgeRouter.get('/decisions', async (c) => {
  const statut = c.req.query('statut') || 'en_attente'

  const list = await db.select().from(decisionsN0)
    .where(eq(decisionsN0.statut, statut as 'en_attente' | 'approuve' | 'rejete'))
    .orderBy(desc(decisionsN0.createdAt))
    .limit(200)

  return c.json(list)
})

// ── Décisions N0 — créer (appelé par les agents) ─────────────
commandBridgeRouter.post(
  '/decisions',
  zValidator('json', z.object({
    poleId:   z.string().optional(),
    poleNom:  z.string(),
    agentNom: z.string(),
    action:   z.string(),
    niveau:   z.enum(['N0', 'N1', 'N2', 'N3']).default('N0'),
    urgence:  z.enum(['haute', 'normale', 'basse']).default('normale'),
  })),
  async (c) => {
    const data = c.req.valid('json')
    const [decision] = await db.insert(decisionsN0).values(data).returning()

    // Injecter dans le blackboard
    await db.insert(blackboardEvents).values({
      poleId:    data.poleId ?? null,
      poleNom:   data.poleNom,
      agentNom:  data.agentNom,
      type:      'decision_created',
      payload:   `[${data.niveau}] ${data.action.slice(0, 200)}`,
      niveau:    data.niveau,
    })

    return c.json({ id: decision.id, statut: decision.statut }, 201)
  }
)

// ── Décisions N0 — approuver ─────────────────────────────────
commandBridgeRouter.post('/decisions/:id/approuver', async (c) => {
  const user = c.get('user') as { sub: string }
  const { id } = c.req.param()

  const [decision] = await db.update(decisionsN0)
    .set({ statut: 'approuve', resolvedAt: new Date(), resolvedBy: user.sub })
    .where(eq(decisionsN0.id, id))
    .returning()

  if (!decision) return c.json({ error: 'Not found' }, 404)

  await db.insert(blackboardEvents).values({
    poleId:    decision.poleId,
    poleNom:   decision.poleNom,
    agentNom:  decision.agentNom,
    type:      'decision_approuvee',
    payload:   `[N0 APPROUVÉ] ${decision.action.slice(0, 200)}`,
    niveau:    'N1',
  })

  return c.json({ ok: true, statut: 'approuve', action: decision.action })
})

// ── Décisions N0 — rejeter ───────────────────────────────────
commandBridgeRouter.post('/decisions/:id/rejeter', async (c) => {
  const user = c.get('user') as { sub: string }
  const { id } = c.req.param()

  const [decision] = await db.update(decisionsN0)
    .set({ statut: 'rejete', resolvedAt: new Date(), resolvedBy: user.sub })
    .where(eq(decisionsN0.id, id))
    .returning()

  if (!decision) return c.json({ error: 'Not found' }, 404)

  await db.insert(blackboardEvents).values({
    poleId:    decision.poleId,
    poleNom:   decision.poleNom,
    agentNom:  decision.agentNom,
    type:      'decision_rejetee',
    payload:   `[N0 REJETÉ] ${decision.action.slice(0, 200)}`,
    niveau:    'N1',
  })

  return c.json({ ok: true, statut: 'rejete' })
})

// ── Kill switch — toggle pause ───────────────────────────────
commandBridgeRouter.post('/poles/:poleId/toggle-pause', async (c) => {
  const user = c.get('user') as { sub: string }
  const { poleId } = c.req.param()

  // Vérifier ownership
  const [pole] = await db.select().from(poles)
    .where(and(eq(poles.id, poleId), eq(poles.ownerId, user.sub)))
  if (!pole) return c.json({ error: 'Not found' }, 404)

  const [existing] = await db.select().from(killSwitches).where(eq(killSwitches.poleId, poleId))

  if (!existing) {
    await db.insert(killSwitches).values({ poleId, enPause: true, updatedBy: user.sub })
    return c.json({ poleId, enPause: true })
  }

  const [updated] = await db.update(killSwitches)
    .set({ enPause: !existing.enPause, updatedAt: new Date(), updatedBy: user.sub })
    .where(eq(killSwitches.poleId, poleId))
    .returning()

  return c.json({ poleId, enPause: updated.enPause })
})

// ── Blackboard — événements récents ─────────────────────────
commandBridgeRouter.get('/blackboard', async (c) => {
  const niveau = c.req.query('niveau')
  const limit  = Math.min(Number(c.req.query('limit') || 30), 100)

  const rows = niveau
    ? await db.select().from(blackboardEvents)
        .where(eq(blackboardEvents.niveau, niveau as 'N0' | 'N1' | 'N2' | 'N3'))
        .orderBy(desc(blackboardEvents.createdAt))
        .limit(limit)
    : await db.select().from(blackboardEvents)
        .orderBy(desc(blackboardEvents.createdAt))
        .limit(limit)

  return c.json(rows)
})
