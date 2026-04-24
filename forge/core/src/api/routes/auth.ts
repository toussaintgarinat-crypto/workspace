import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const authRouter = new Hono()

// ── Profil — mise à jour nom / emoji ────────────────────────
authRouter.patch(
  '/me',
  zValidator('json', z.object({
    nom:         z.string().min(1).max(100).optional(),
    avatarEmoji: z.string().optional(),
  })),
  async (c) => {
    const { sub } = c.get('user') as { sub: string }
    const data    = c.req.valid('json')

    const updates: Record<string, string> = {}
    if (data.nom)         updates.nom         = data.nom.trim()
    if (data.avatarEmoji) updates.avatarEmoji = data.avatarEmoji

    const [user] = await db.update(users).set(updates).where(eq(users.id, sub)).returning()
    return c.json({ user: { id: user.id, nom: user.nom, avatarEmoji: user.avatarEmoji } })
  }
)

// ── RGPD — Export données ────────────────────────────────────
authRouter.get('/me/export', async (c) => {
  const { sub } = c.get('user') as { sub: string }

  const [user] = await db.select({
    id: users.id, email: users.email, nom: users.nom,
    avatarEmoji: users.avatarEmoji, createdAt: users.createdAt,
  }).from(users).where(eq(users.id, sub))

  return c.json({
    user,
    exportDate: new Date().toISOString(),
    note: 'GDPR Export — Article 20 — Right to data portability',
  })
})

// ── RGPD — Suppression compte ────────────────────────────────
authRouter.delete('/me', async (c) => {
  const { sub } = c.get('user') as { sub: string }

  await db.update(users).set({
    email:       `deleted_${sub}@rgpd.deleted`,
    nom:         '[Deleted account]',
    avatarEmoji: '❌',
    keycloakSub: null,
  }).where(eq(users.id, sub))

  return c.json({ ok: true })
})
