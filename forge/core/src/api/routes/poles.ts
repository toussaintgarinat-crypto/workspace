import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { poles, poleMembers, llmPresets } from '@/db/schema'
import { eq, and, or } from 'drizzle-orm'

export const polesRouter = new Hono()

// ── Les 5 pôles par défaut à l'onboarding ───────────────────
export const DEFAULT_POLES = [
  { nom: 'Stratégie & Finance',    emoji: '📊', couleur: '#6366f1', type: 'finance'   as const },
  { nom: 'Croissance & Marketing', emoji: '🚀', couleur: '#f59e0b', type: 'marketing' as const },
  { nom: 'Ventes & Clientèle',     emoji: '🤝', couleur: '#10b981', type: 'sales'     as const },
  { nom: 'Opérations & Tech',      emoji: '⚙️', couleur: '#3b82f6', type: 'ops'       as const },
  { nom: 'Sentinel & Juridique',   emoji: '🛡️', couleur: '#ef4444', type: 'legal'     as const },
]

// GET /api/poles
polesRouter.get('/', async (c) => {
  const user = c.get('user') as { sub: string; orgId: string | null }

  const list = await db.select().from(poles).where(
    user.orgId
      ? eq(poles.orgId, user.orgId)
      : eq(poles.ownerId, user.sub)
  )

  if (list.length === 0) return c.json([])

  const { inArray } = await import('drizzle-orm')
  const configs = await db.select().from(llmPresets)
    .where(and(eq(llmPresets.scopeType, 'pole'), inArray(llmPresets.scopeId, list.map(p => p.id))))

  const configMap = Object.fromEntries(configs.map(cfg => [cfg.scopeId, cfg]))

  return c.json(list.map(p => ({ ...p, llmConfig: configMap[p.id] ?? null })))
})

// GET /api/poles/:id
polesRouter.get('/:id', async (c) => {
  const user = c.get('user') as { sub: string; orgId: string | null }
  const { id } = c.req.param()

  const [pole] = await db.select().from(poles)
    .where(and(
      eq(poles.id, id),
      user.orgId
        ? or(eq(poles.orgId, user.orgId), eq(poles.ownerId, user.sub))
        : eq(poles.ownerId, user.sub),
    ))

  if (!pole) return c.json({ error: 'Not found' }, 404)

  const [config] = await db.select().from(llmPresets)
    .where(and(eq(llmPresets.scopeType, 'pole'), eq(llmPresets.scopeId, id)))
  const members = await db.select().from(poleMembers).where(eq(poleMembers.poleId, id))

  return c.json({ ...pole, llmConfig: config ?? null, members })
})

// POST /api/poles — ventureId obligatoire
polesRouter.post(
  '/',
  zValidator('json', z.object({
    nom:         z.string().min(1).max(100),
    description: z.string().default(''),
    emoji:       z.string().default('🌍'),
    couleur:     z.string().default('#6366f1'),
    type:        z.enum(['finance', 'marketing', 'sales', 'ops', 'legal', 'custom', 'dev']).default('custom'),
    ventureId:   z.string().uuid('ventureId est obligatoire'),
  })),
  async (c) => {
    const user = c.get('user') as { sub: string; nom: string; avatarEmoji: string }
    const data = c.req.valid('json')

    const [pole] = await db.insert(poles).values({
      ...data, ownerId: user.sub, orgId: user.orgId ?? undefined,
    }).returning()

    // Ajouter le créateur comme owner
    await db.insert(poleMembers).values({
      poleId: pole.id, userId: user.sub,
      nom: user.nom, avatarEmoji: user.avatarEmoji, role: 'owner',
    })

    await db.insert(llmPresets).values({
      scopeType: 'pole', scopeId: pole.id,
      ventureId: data.ventureId, updatedBy: user.sub,
    })

    return c.json(pole, 201)
  }
)

// PATCH /api/poles/:id
polesRouter.patch(
  '/:id',
  zValidator('json', z.object({
    nom:         z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    emoji:       z.string().optional(),
    couleur:     z.string().optional(),
    type:        z.enum(['finance', 'marketing', 'sales', 'ops', 'legal', 'custom', 'dev']).optional(),
    ventureId:   z.string().nullable().optional(),
  })),
  async (c) => {
    const user = c.get('user') as { sub: string }
    const { id } = c.req.param()
    const data = c.req.valid('json')

    const [pole] = await db.update(poles)
      .set(data)
      .where(and(eq(poles.id, id), eq(poles.ownerId, user.sub)))
      .returning()

    if (!pole) return c.json({ error: 'Not found' }, 404)
    return c.json(pole)
  }
)

// DELETE /api/poles/:id
polesRouter.delete('/:id', async (c) => {
  const user = c.get('user') as { sub: string }
  const { id } = c.req.param()

  await db.delete(poles).where(and(eq(poles.id, id), eq(poles.ownerId, user.sub)))
  return c.json({ deleted: true })
})

