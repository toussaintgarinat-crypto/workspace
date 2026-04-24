import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { ventures, ventureMembers, ventureDeleteTokens, poles, poleMembers, llmPresets, users } from '../../db/schema'
import { eq, and, desc, sql, or, isNull, gt } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'
import { sendVentureDeletionCode } from '../../email'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// Pôles créés par défaut pour chaque nouvelle venture
const DEFAULT_POLES = [
  { nom: 'Finance',    type: 'finance'   as const, emoji: '📊', couleur: '#10b981' },
  { nom: 'Marketing',  type: 'marketing' as const, emoji: '🚀', couleur: '#8b5cf6' },
  { nom: 'Sales',      type: 'sales'     as const, emoji: '🤝', couleur: '#f59e0b' },
  { nom: 'Opérations', type: 'ops'       as const, emoji: '⚙️', couleur: '#3b82f6' },
  { nom: 'Juridique',  type: 'legal'     as const, emoji: '🛡️', couleur: '#ef4444' },
  { nom: 'Dev',        type: 'dev'       as const, emoji: '💻', couleur: '#6366f1' },
]

app.get('/ventures', async (c) => {
  const user  = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const rows  = await db.select().from(ventures)
    .where(and(
      eq(ventures.ownerId, user.sub),
      orgId ? or(eq(ventures.orgId, orgId), isNull(ventures.orgId)) : sql`1=1`,
    ))
    .orderBy(desc(ventures.createdAt))
  return c.json(rows)
})

app.post('/ventures', zValidator('json', z.object({
  nom:         z.string().min(1).max(200),
  description: z.string().optional(),
  emoji:       z.string().optional(),
  couleur:     z.string().optional(),
  type:        z.enum(['own', 'audit']).optional(),
})), async (c) => {
  const user  = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body  = c.req.valid('json')

  const [venture] = await db.insert(ventures).values({
    ownerId: user.sub, orgId: orgId ?? undefined,
    nom: body.nom, description: body.description ?? '',
    emoji: body.emoji ?? '🚀', couleur: body.couleur ?? '#6366f1',
    type: body.type ?? 'own',
  }).returning()

  // Créer les pôles par défaut
  for (const p of DEFAULT_POLES) {
    const [pole] = await db.insert(poles).values({
      ...p, ventureId: venture.id,
      ownerId: user.sub, orgId: orgId ?? undefined,
    }).returning()
    await db.insert(poleMembers).values({
      poleId: pole.id, userId: user.sub,
      nom: user.nom ?? 'Utilisateur', avatarEmoji: user.avatarEmoji ?? '👤', role: 'owner',
    })
    await db.insert(llmPresets).values({ scopeType: 'pole', scopeId: pole.id, ventureId: venture.id, updatedBy: user.sub })
  }

  return c.json(venture, 201)
})

app.get('/ventures/:id', async (c) => {
  const { id } = c.req.param()
  const user   = c.get('user')
  const [venture] = await db.select().from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.ownerId, user.sub))).limit(1)
  if (!venture) return c.json({ error: 'Not found' }, 404)
  const members = await db.select().from(ventureMembers)
    .where(eq(ventureMembers.ventureId, id))
  return c.json({ ...venture, members })
})

app.patch('/ventures/:id', zValidator('json', z.object({
  nom:         z.string().optional(),
  description: z.string().optional(),
  emoji:       z.string().optional(),
  couleur:     z.string().optional(),
  statut:      z.enum(['actif', 'archive', 'livre']).optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user   = c.get('user')
  const body   = c.req.valid('json')
  const [venture] = await db.update(ventures)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(ventures.id, id), eq(ventures.ownerId, user.sub)))
    .returning()
  return c.json(venture)
})

// POST /api/ventures/:id/delete-request — envoie un code de confirmation par email
app.post('/ventures/:id/delete-request', async (c) => {
  const { id } = c.req.param()
  const user   = c.get('user')

  const [venture] = await db.select().from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.ownerId, user.sub))).limit(1)
  if (!venture) return c.json({ error: 'Not found' }, 404)

  // Récupérer l'email de l'utilisateur
  const [userRow] = await db.select({ email: users.email }).from(users)
    .where(eq(users.id, user.sub)).limit(1)
  if (!userRow?.email) return c.json({ error: 'No email on account' }, 400)

  // Invalider les anciens tokens pour cette venture
  await db.delete(ventureDeleteTokens)
    .where(and(eq(ventureDeleteTokens.ventureId, id), eq(ventureDeleteTokens.userId, user.sub)))

  // Générer code 6 chiffres
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 min

  await db.insert(ventureDeleteTokens).values({
    ventureId: id, userId: user.sub, code, expiresAt,
  })

  try {
    await sendVentureDeletionCode({
      to:          userRow.email,
      ventureName: venture.nom,
      code,
      expiresIn:   '15 minutes',
    })
  } catch (err: any) {
    console.error('[forge:email] Failed to send deletion code:', err?.message)
    return c.json({ error: 'Email sending failed. Check SMTP configuration.' }, 500)
  }

  return c.json({ ok: true, email: userRow.email.replace(/(.{2}).+(@.+)/, '$1***$2') })
})

// DELETE /api/ventures/:id — suppression définitive avec code
app.delete('/ventures/:id', zValidator('json', z.object({ code: z.string().length(6) })), async (c) => {
  const { id } = c.req.param()
  const user   = c.get('user')
  const { code } = c.req.valid('json')

  const [token] = await db.select().from(ventureDeleteTokens)
    .where(and(
      eq(ventureDeleteTokens.ventureId, id),
      eq(ventureDeleteTokens.userId,    user.sub),
      eq(ventureDeleteTokens.code,      code),
      gt(ventureDeleteTokens.expiresAt, new Date()),
      isNull(ventureDeleteTokens.usedAt),
    )).limit(1)

  if (!token) return c.json({ error: 'Code invalide ou expiré' }, 400)

  // Marquer le token comme utilisé
  await db.update(ventureDeleteTokens)
    .set({ usedAt: new Date() })
    .where(eq(ventureDeleteTokens.id, token.id))

  // Supprimer la venture (cascade sur pôles, sessions, etc.)
  await db.delete(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.ownerId, user.sub)))

  return c.json({ ok: true })
})

// GET /api/ventures/:id/poles
app.get('/ventures/:id/poles', async (c) => {
  const { id } = c.req.param()
  const list = await db.select().from(poles).where(eq(poles.ventureId, id))
  return c.json(list)
})

// POST /api/ventures/:id/poles — créer un pôle dans une venture
app.post('/ventures/:id/poles', zValidator('json', z.object({
  nom:         z.string().min(1).max(100),
  description: z.string().default(''),
  emoji:       z.string().default('🌍'),
  couleur:     z.string().default('#6366f1'),
  type:        z.enum(['finance', 'marketing', 'sales', 'ops', 'legal', 'custom', 'dev']).default('custom'),
})), async (c) => {
  const { id: ventureId } = c.req.param()
  const user = c.get('user') as JWTPayload & { nom?: string; avatarEmoji?: string; orgId?: string }
  const body = c.req.valid('json')

  const [pole] = await db.insert(poles).values({
    ...body, ventureId, ownerId: user.sub, orgId: user.orgId ?? undefined,
  }).returning()

  await db.insert(poleMembers).values({
    poleId: pole.id, userId: user.sub,
    nom: user.nom ?? 'Utilisateur', avatarEmoji: user.avatarEmoji ?? '👤', role: 'owner',
  })
  await db.insert(llmPresets).values({ scopeType: 'pole', scopeId: pole.id, ventureId: ventureId, updatedBy: user.sub })

  return c.json(pole, 201)
})

export default app
