import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { socialAccounts } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

export const PLATFORMS: Record<string, { label: string; emoji: string; color: string }> = {
  instagram: { label: 'Instagram',   emoji: '📸', color: '#e1306c' },
  linkedin:  { label: 'LinkedIn',    emoji: '💼', color: '#0077b5' },
  facebook:  { label: 'Facebook',    emoji: '📘', color: '#1877f2' },
  twitter:   { label: 'X / Twitter', emoji: '🐦', color: '#000000' },
  tiktok:    { label: 'TikTok',      emoji: '🎵', color: '#ff0050' },
  youtube:   { label: 'YouTube',     emoji: '▶️', color: '#ff0000' },
  bluesky:   { label: 'Bluesky',     emoji: '🦋', color: '#0085ff' },
  pinterest: { label: 'Pinterest',   emoji: '📌', color: '#e60023' },
  threads:   { label: 'Threads',     emoji: '🧵', color: '#000000' },
  mastodon:  { label: 'Mastodon',    emoji: '🐘', color: '#6364ff' },
}

app.get('/social/platforms', (c) => c.json(PLATFORMS))

app.get('/poles/:poleId/social', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const list = await db.select().from(socialAccounts)
    .where(and(eq(socialAccounts.poleId, poleId), eq(socialAccounts.userId, user.sub)))
    .orderBy(desc(socialAccounts.createdAt))
  return c.json(list.map(a => ({
    ...a,
    meta: PLATFORMS[a.platform] ?? { label: a.platform, emoji: '🌐', color: '#64748b' }
  })))
})

app.post('/poles/:poleId/social', zValidator('json', z.object({
  platform: z.string().min(1),
  nom:      z.string().min(1).max(200),
  config:   z.record(z.string()).optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [account] = await db.insert(socialAccounts).values({
    poleId, userId: user.sub,
    platform: body.platform,
    nom: body.nom,
    config: JSON.stringify(body.config ?? {}),
  }).returning()
  return c.json({ ...account, meta: PLATFORMS[account.platform] ?? {} }, 201)
})

app.patch('/social/:id', zValidator('json', z.object({
  nom:    z.string().optional(),
  actif:  z.boolean().optional(),
  config: z.record(z.string()).optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const updates: Record<string, unknown> = {}
  if (body.nom !== undefined)    updates.nom = body.nom
  if (body.actif !== undefined)  updates.actif = body.actif
  if (body.config !== undefined) updates.config = JSON.stringify(body.config)
  const [account] = await db.update(socialAccounts).set(updates)
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.userId, user.sub)))
    .returning()
  if (!account) return c.json({ error: 'Not found' }, 404)
  return c.json({ ...account, meta: PLATFORMS[account.platform] ?? {} })
})

app.delete('/social/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
