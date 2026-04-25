import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import {
  repetitionConfigs, repetitionEvents, repetitionSilences,
  hitlRequests, poleDevRequests, poles,
} from '@/db/schema'
import { eq, and, gte, count, sql } from 'drizzle-orm'
import type { JWTPayload } from '@/api/middleware/auth'

const router = new Hono<{ Variables: { user: JWTPayload } }>()

// GET /api/poles/:poleId/repetition-config
router.get('/poles/:poleId/repetition-config', async (c) => {
  const { poleId } = c.req.param()
  const [cfg] = await db.select().from(repetitionConfigs).where(eq(repetitionConfigs.poleId, poleId))
  return c.json(cfg ?? { poleId, seuilOccurrences: 3, periodeJours: 7, silenceDays: 30, actif: true })
})

// PUT /api/poles/:poleId/repetition-config
router.put('/poles/:poleId/repetition-config', zValidator('json', z.object({
  seuilOccurrences: z.number().int().min(1).max(50).optional(),
  periodeJours:     z.number().int().min(1).max(90).optional(),
  silenceDays:      z.number().int().min(0).max(365).optional(),
  actif:            z.boolean().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const body = c.req.valid('json')

  const [existing] = await db.select({ id: repetitionConfigs.id }).from(repetitionConfigs)
    .where(eq(repetitionConfigs.poleId, poleId))

  if (existing) {
    const [cfg] = await db.update(repetitionConfigs)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(repetitionConfigs.poleId, poleId))
      .returning()
    return c.json(cfg)
  }

  const [cfg] = await db.insert(repetitionConfigs)
    .values({ poleId, ...body })
    .returning()
  return c.json(cfg)
})

// POST /api/repetition/event — logguer une action et vérifier le seuil
router.post('/repetition/event', zValidator('json', z.object({
  poleId:      z.string().uuid(),
  actionKey:   z.string().min(1),
  actionLabel: z.string().min(1),
})), async (c) => {
  const user = c.get('user') as { sub: string; nom?: string }
  const { poleId, actionKey, actionLabel } = c.req.valid('json')

  // Charger la config (ou defaults)
  const [cfg] = await db.select().from(repetitionConfigs).where(eq(repetitionConfigs.poleId, poleId))
  const seuil      = cfg?.seuilOccurrences ?? 3
  const periodeJ   = cfg?.periodeJours ?? 7
  const silenceD   = cfg?.silenceDays ?? 30
  const actif      = cfg?.actif ?? true

  if (!actif) return c.json({ triggered: false })

  // Vérifier si action en silence
  const now = new Date()
  const [silence] = await db.select().from(repetitionSilences)
    .where(and(
      eq(repetitionSilences.poleId, poleId),
      eq(repetitionSilences.actionKey, actionKey),
      gte(repetitionSilences.silenceUntil, now),
    ))
  if (silence) return c.json({ triggered: false, silenced: true })

  // Vérifier si HITL déjà en attente pour cette action
  const [pendingHitl] = await db.select({ id: hitlRequests.id }).from(hitlRequests)
    .where(and(
      eq(hitlRequests.statut, 'pending'),
      sql`${hitlRequests.payload}::jsonb->>'actionKey' = ${actionKey}`,
      sql`${hitlRequests.payload}::jsonb->>'poleId' = ${poleId}`,
    ))
  if (pendingHitl) return c.json({ triggered: false, alreadyPending: true })

  // Logger l'événement
  await db.insert(repetitionEvents).values({ poleId, userId: user.sub, actionKey, actionLabel })

  // Compter les occurrences dans la période
  const since = new Date(Date.now() - periodeJ * 86400000)
  const [{ total }] = await db.select({ total: count() }).from(repetitionEvents)
    .where(and(
      eq(repetitionEvents.poleId, poleId),
      eq(repetitionEvents.actionKey, actionKey),
      gte(repetitionEvents.createdAt, since),
    ))

  if (total >= seuil) {
    // Créer une demande HITL
    const [hitl] = await db.insert(hitlRequests).values({
      userId:  user.sub,
      niveau:  1,
      action:  'repetition_suggest',
      payload: JSON.stringify({ poleId, actionKey, actionLabel, count: total, periodeJours: periodeJ }),
      statut:  'pending',
    }).returning()
    return c.json({ triggered: true, hitlId: hitl.id, count: total })
  }

  return c.json({ triggered: false, count: total, remaining: seuil - total })
})

// GET /api/repetition/pending/:poleId — suggestions en attente pour un pôle
router.get('/repetition/pending/:poleId', async (c) => {
  const { poleId } = c.req.param()
  const pending = await db.select().from(hitlRequests)
    .where(and(
      eq(hitlRequests.statut, 'pending'),
      eq(hitlRequests.action, 'repetition_suggest'),
      sql`${hitlRequests.payload}::jsonb->>'poleId' = ${poleId}`,
    ))
  return c.json(pending)
})

// POST /api/repetition/respond/:hitlId — approuver ou rejeter
router.post('/repetition/respond/:hitlId', zValidator('json', z.object({
  decision: z.enum(['approve', 'reject']),
})), async (c) => {
  const user = c.get('user') as { sub: string; nom?: string }
  const { hitlId } = c.req.param()
  const { decision } = c.req.valid('json')

  const [hitl] = await db.select().from(hitlRequests).where(eq(hitlRequests.id, hitlId))
  if (!hitl || hitl.statut !== 'pending') return c.json({ error: 'Not found or already resolved' }, 404)

  const payload = JSON.parse(hitl.payload as string) as {
    poleId: string; actionKey: string; actionLabel: string; count: number; periodeJours: number
  }

  await db.update(hitlRequests)
    .set({ statut: decision === 'approve' ? 'approved' : 'rejected', decidePar: user.sub, decideAt: new Date() })
    .where(eq(hitlRequests.id, hitlId))

  if (decision === 'approve') {
    // Récupérer infos du pôle
    const [pole] = await db.select({ nom: poles.nom, emoji: poles.emoji }).from(poles).where(eq(poles.id, payload.poleId))
    await db.insert(poleDevRequests).values({
      sourcePoleId:   payload.poleId,
      sourcePoleName: pole?.nom ?? 'Pôle',
      sourcePoleEmoji: pole?.emoji ?? '📌',
      title:          `Automatiser : ${payload.actionLabel}`,
      description:    `Action "${payload.actionLabel}" répétée ${payload.count} fois en ${payload.periodeJours} jours. Soumis automatiquement par le système de détection.`,
      frequency:      'on_event',
      priority:       'medium',
      userId:         user.sub,
    })
  } else {
    // Mettre en silence
    const [cfg] = await db.select({ silenceDays: repetitionConfigs.silenceDays })
      .from(repetitionConfigs).where(eq(repetitionConfigs.poleId, payload.poleId))
    const silenceDays = cfg?.silenceDays ?? 30
    const silenceUntil = new Date(Date.now() + silenceDays * 86400000)

    await db.insert(repetitionSilences)
      .values({ poleId: payload.poleId, actionKey: payload.actionKey, silenceUntil })
      .onConflictDoUpdate({
        target: [repetitionSilences.poleId, repetitionSilences.actionKey],
        set: { silenceUntil },
      })
  }

  return c.json({ ok: true, decision })
})

export default router
