import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { organizations, organizationMembers, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import type { JWTPayload } from '@/api/middleware/auth'

export const orgsRouter = new Hono<{ Variables: { user: JWTPayload } }>()

// GET /api/orgs — liste les orgs de l'utilisateur
orgsRouter.get('/', async (c) => {
  const user = c.get('user')

  const memberships = await db.select({
    org:  organizations,
    role: organizationMembers.role,
  })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
    .where(eq(organizationMembers.userId, user.sub))

  return c.json(memberships.map(m => ({ ...m.org, role: m.role, active: m.org.id === user.orgId })))
})

// POST /api/orgs — créer une organisation
orgsRouter.post(
  '/',
  zValidator('json', z.object({
    nom:   z.string().min(1).max(100),
    emoji: z.string().default('🏢'),
    slug:  z.string().min(2).max(50).regex(/^[a-z0-9-]+$/).optional(),
  })),
  async (c) => {
    const user = c.get('user')
    const { nom, emoji, slug: rawSlug } = c.req.valid('json')
    const slug = rawSlug ?? `${nom.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`

    const [org] = await db.insert(organizations)
      .values({ nom, emoji, slug, ownerId: user.sub, plan: 'team' })
      .returning()

    await db.insert(organizationMembers).values({ orgId: org.id, userId: user.sub, role: 'owner' })

    return c.json(org, 201)
  }
)

// GET /api/orgs/:id — détails + membres
orgsRouter.get('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const [membership] = await db.select().from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, id), eq(organizationMembers.userId, user.sub)))
  if (!membership) return c.json({ error: 'Not found' }, 404)

  const [org] = await db.select().from(organizations).where(eq(organizations.id, id))

  const members = await db.select({
    id:          organizationMembers.id,
    userId:      organizationMembers.userId,
    role:        organizationMembers.role,
    joinedAt:    organizationMembers.joinedAt,
    nom:         users.nom,
    avatarEmoji: users.avatarEmoji,
    email:       users.email,
  })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.orgId, id))

  return c.json({ ...org, members, myRole: membership.role })
})

// PATCH /api/orgs/:id — modifier nom/emoji
orgsRouter.patch(
  '/:id',
  zValidator('json', z.object({
    nom:   z.string().min(1).max(100).optional(),
    emoji: z.string().optional(),
  })),
  async (c) => {
    const user = c.get('user')
    const { id } = c.req.param()
    const data = c.req.valid('json')

    const [org] = await db.update(organizations)
      .set(data)
      .where(and(eq(organizations.id, id), eq(organizations.ownerId, user.sub)))
      .returning()

    if (!org) return c.json({ error: 'Not found or not owner' }, 403)
    return c.json(org)
  }
)

// POST /api/orgs/:id/members — inviter un utilisateur par email
orgsRouter.post(
  '/:id/members',
  zValidator('json', z.object({ email: z.string().email(), role: z.enum(['admin', 'member']).default('member') })),
  async (c) => {
    const user = c.get('user')
    const { id } = c.req.param()
    const { email, role } = c.req.valid('json')

    // Vérifier que le demandeur est owner/admin
    const [myMembership] = await db.select().from(organizationMembers)
      .where(and(eq(organizationMembers.orgId, id), eq(organizationMembers.userId, user.sub)))
    if (!myMembership || myMembership.role === 'member') return c.json({ error: 'Forbidden' }, 403)

    // Trouver l'utilisateur cible
    const [target] = await db.select().from(users).where(eq(users.email, email))
    if (!target) return c.json({ error: 'User not found' }, 404)

    await db.insert(organizationMembers)
      .values({ orgId: id, userId: target.id, role })
      .onConflictDoUpdate({
        target: [organizationMembers.orgId, organizationMembers.userId],
        set: { role },
      })

    return c.json({ ok: true, userId: target.id, role })
  }
)

// DELETE /api/orgs/:id/members/:userId — retirer un membre
orgsRouter.delete('/:id/members/:userId', async (c) => {
  const user = c.get('user')
  const { id, userId } = c.req.param()

  // On ne peut pas retirer le owner
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id))
  if (org?.ownerId === userId) return c.json({ error: 'Cannot remove owner' }, 400)

  // Vérifier owner/admin OU self-remove
  const [myMembership] = await db.select().from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, id), eq(organizationMembers.userId, user.sub)))
  if (!myMembership) return c.json({ error: 'Forbidden' }, 403)
  if (myMembership.role === 'member' && userId !== user.sub) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(organizationMembers)
    .where(and(eq(organizationMembers.orgId, id), eq(organizationMembers.userId, userId)))

  return c.json({ ok: true })
})

// DELETE /api/orgs/:id — supprimer l'organisation (owner seulement)
orgsRouter.delete('/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const [org] = await db.select().from(organizations).where(eq(organizations.id, id))
  if (!org || org.ownerId !== user.sub) return c.json({ error: 'Forbidden' }, 403)
  if (org.plan === 'personal') return c.json({ error: 'Cannot delete personal org' }, 400)

  await db.delete(organizations).where(eq(organizations.id, id))
  return c.json({ ok: true })
})
