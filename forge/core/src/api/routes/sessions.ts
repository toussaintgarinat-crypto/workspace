import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { sessions, messages, poles, ventures, poleMembers, ventureMembers } from '@/db/schema'
import { eq, and, asc, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

export const sessionsRouter = new Hono<{ Variables: { user: JWTPayload } }>()

// GET /api/sessions — liste les sessions selon le scope
// ?poleId=xxx  → sessions du pôle (membres du pôle)
// ?ventureId=xxx → sessions de la venture (membres de la venture)
// (aucun param) → sessions personnelles de l'utilisateur
sessionsRouter.get('/', async (c) => {
  const user    = c.get('user') as { sub: string }
  const poleId    = c.req.query('poleId')
  const ventureId = c.req.query('ventureId')

  let list: any[]

  if (poleId) {
    // Vérifier que l'utilisateur est membre du pôle
    const [member] = await db.select().from(poleMembers)
      .where(and(eq(poleMembers.poleId, poleId), eq(poleMembers.userId, user.sub)))
    const isOwner = await db.select().from(poles)
      .where(and(eq(poles.id, poleId), eq(poles.ownerId, user.sub)))
    if (!member && !isOwner.length) return c.json({ error: 'Forbidden' }, 403)

    list = await db
      .select({
        id: sessions.id, userId: sessions.userId, orgId: sessions.orgId,
        name: sessions.name, poleId: sessions.poleId, ventureId: sessions.ventureId,
        scope: sessions.scope, createdAt: sessions.createdAt, updatedAt: sessions.updatedAt,
        poleName: poles.nom, poleEmoji: poles.emoji, poleCouleur: poles.couleur,
      })
      .from(sessions)
      .leftJoin(poles, eq(sessions.poleId, poles.id))
      .where(and(eq(sessions.poleId, poleId), eq(sessions.scope, 'pole')))
      .orderBy(desc(sessions.updatedAt))

  } else if (ventureId) {
    // Vérifier que l'utilisateur est membre de la venture
    const [member] = await db.select().from(ventureMembers)
      .where(and(eq(ventureMembers.ventureId, ventureId), eq(ventureMembers.userId, user.sub)))
    const isOwner = await db.select().from(ventures)
      .where(and(eq(ventures.id, ventureId), eq(ventures.ownerId, user.sub)))
    if (!member && !isOwner.length) return c.json({ error: 'Forbidden' }, 403)

    list = await db
      .select({
        id: sessions.id, userId: sessions.userId, orgId: sessions.orgId,
        name: sessions.name, poleId: sessions.poleId, ventureId: sessions.ventureId,
        scope: sessions.scope, createdAt: sessions.createdAt, updatedAt: sessions.updatedAt,
        ventureName: ventures.nom, ventureEmoji: ventures.emoji, ventureCouleur: ventures.couleur,
      })
      .from(sessions)
      .leftJoin(ventures, eq(sessions.ventureId, ventures.id))
      .where(and(eq(sessions.ventureId, ventureId), eq(sessions.scope, 'venture')))
      .orderBy(desc(sessions.updatedAt))

  } else {
    // Sessions personnelles — scope user OU sessions avec poleId/ventureId créées par cet user
    list = await db
      .select({
        id: sessions.id, userId: sessions.userId, orgId: sessions.orgId,
        name: sessions.name, poleId: sessions.poleId, ventureId: sessions.ventureId,
        scope: sessions.scope, createdAt: sessions.createdAt, updatedAt: sessions.updatedAt,
        poleName: poles.nom, poleEmoji: poles.emoji, poleCouleur: poles.couleur,
        ventureName: ventures.nom, ventureEmoji: ventures.emoji,
      })
      .from(sessions)
      .leftJoin(poles, eq(sessions.poleId, poles.id))
      .leftJoin(ventures, eq(sessions.ventureId, ventures.id))
      .where(eq(sessions.userId, user.sub))
      .orderBy(desc(sessions.updatedAt))
  }

  return c.json(list)
})

// POST /api/sessions — créer une session
sessionsRouter.post(
  '/',
  zValidator('json', z.object({
    name:      z.string().optional(),
    poleId:    z.string().uuid().optional(),
    ventureId: z.string().uuid().optional(),
    scope:     z.enum(['user', 'pole', 'venture']).optional(),
  })),
  async (c) => {
    const user = c.get('user') as { sub: string }
    const { name, poleId, ventureId, scope } = c.req.valid('json')
    const orgId = c.req.header('X-Org-ID')

    // Déterminer le scope automatiquement si non fourni
    let resolvedScope: 'user' | 'pole' | 'venture' = scope ?? 'user'
    if (!scope) {
      if (ventureId) resolvedScope = 'venture'
      else if (poleId) resolvedScope = 'pole'
    }

    // Construire le nom par défaut selon le scope
    let defaultName = 'New conversation'
    if (resolvedScope === 'pole' && poleId) {
      const [pole] = await db.select({ nom: poles.nom }).from(poles).where(eq(poles.id, poleId))
      if (pole) defaultName = `Chat · ${pole.nom}`
    } else if (resolvedScope === 'venture' && ventureId) {
      const [venture] = await db.select({ nom: ventures.nom }).from(ventures).where(eq(ventures.id, ventureId))
      if (venture) defaultName = `Chat · ${venture.nom}`
    }

    const [session] = await db.insert(sessions).values({
      userId:    user.sub,
      orgId:     orgId ?? undefined,
      name:      name ?? defaultName,
      poleId:    poleId ?? null,
      ventureId: ventureId ?? null,
      scope:     resolvedScope,
    }).returning()

    return c.json(session, 201)
  }
)

// PATCH /api/sessions/:id — renommer
sessionsRouter.patch(
  '/:id',
  zValidator('json', z.object({ name: z.string() })),
  async (c) => {
    const { id } = c.req.param()
    const { name } = c.req.valid('json')
    const [updated] = await db
      .update(sessions)
      .set({ name, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .returning()
    return c.json(updated)
  }
)

// GET /api/sessions/:id/messages
sessionsRouter.get('/:id/messages', async (c) => {
  const user = c.get('user') as { sub: string }
  const { id } = c.req.param()

  // Vérifier accès : owner direct ou membre du pôle/venture
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id))
  if (!session) return c.json({ error: 'Not found' }, 404)

  const hasAccess = session.userId === user.sub
    || (session.scope === 'pole' && session.poleId && await checkPoleMembership(session.poleId, user.sub))
    || (session.scope === 'venture' && session.ventureId && await checkVentureMembership(session.ventureId, user.sub))

  if (!hasAccess) return c.json({ error: 'Forbidden' }, 403)

  const list = await db.select().from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(asc(messages.createdAt))

  return c.json(list)
})

// DELETE /api/sessions/:id
sessionsRouter.delete('/:id', async (c) => {
  const user = c.get('user') as { sub: string }
  const { id } = c.req.param()
  await db.delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, user.sub)))
  return c.json({ deleted: true })
})

// ── Helpers ───────────────────────────────────────────────────
async function checkPoleMembership(poleId: string, userId: string): Promise<boolean> {
  const [member] = await db.select().from(poleMembers)
    .where(and(eq(poleMembers.poleId, poleId), eq(poleMembers.userId, userId)))
  if (member) return true
  const [owner] = await db.select().from(poles)
    .where(and(eq(poles.id, poleId), eq(poles.ownerId, userId)))
  return !!owner
}

async function checkVentureMembership(ventureId: string, userId: string): Promise<boolean> {
  const [member] = await db.select().from(ventureMembers)
    .where(and(eq(ventureMembers.ventureId, ventureId), eq(ventureMembers.userId, userId)))
  if (member) return true
  const [owner] = await db.select().from(ventures)
    .where(and(eq(ventures.id, ventureId), eq(ventures.ownerId, userId)))
  return !!owner
}
