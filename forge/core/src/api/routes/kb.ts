import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { kbArticles } from '../../db/schema'
import { eq, and, desc, ilike, or, sql } from 'drizzle-orm'
import { ingest, deleteBySource } from '../../memory/ingestor'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/kb/articles', async (c) => {
  const user = c.get('user')
  const q = c.req.query('q')
  const where = q
    ? and(eq(kbArticles.userId, user.sub), or(ilike(kbArticles.titre, `%${q}%`), ilike(kbArticles.contenu, `%${q}%`)))
    : eq(kbArticles.userId, user.sub)
  const articles = await db.select().from(kbArticles).where(where).orderBy(desc(kbArticles.isPinned), desc(kbArticles.updatedAt))
  const [stats] = await db.select({
    total:    sql<number>`count(*)`,
    publics:  sql<number>`count(*) filter (where is_public = true)`,
    epingles: sql<number>`count(*) filter (where is_pinned = true)`,
  }).from(kbArticles).where(eq(kbArticles.userId, user.sub))
  return c.json({ articles, stats })
})

app.get('/kb/articles/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [a] = await db.select().from(kbArticles).where(and(eq(kbArticles.id, id), eq(kbArticles.userId, user.sub)))
  if (!a) return c.json({ error: 'Not found' }, 404)
  return c.json(a)
})

app.post('/kb/articles', zValidator('json', z.object({
  titre:    z.string().min(1),
  contenu:  z.string().optional(),
  tags:     z.array(z.string()).optional(),
  isPinned: z.boolean().optional(),
  isPublic: z.boolean().optional(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [a] = await db.insert(kbArticles).values({
    userId:   user.sub,
    titre:    body.titre,
    contenu:  body.contenu ?? '',
    tags:     JSON.stringify(body.tags ?? []),
    isPinned: body.isPinned ?? false,
    isPublic: body.isPublic ?? false,
  }).returning()

  // Ingestion async dans Qdrant (ne bloque pas la réponse)
  if (a.contenu) {
    ingest({ text: a.contenu, sourceId: a.id, sourceType: 'kb_article', userId: user.sub, title: a.titre }).catch(() => {})
  }

  return c.json({ ...a, tags: body.tags ?? [] }, 201)
})

app.patch('/kb/articles/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json()
  if (body.tags) body.tags = JSON.stringify(body.tags)
  const [a] = await db.update(kbArticles).set({ ...body, updatedAt: new Date() })
    .where(and(eq(kbArticles.id, id), eq(kbArticles.userId, user.sub))).returning()

  // Ré-ingestion si le contenu a changé
  if (body.contenu && a) {
    deleteBySource(id).then(() =>
      ingest({ text: a.contenu, sourceId: id, sourceType: 'kb_article', userId: user.sub, title: a.titre })
    ).catch(() => {})
  }

  return c.json(a)
})

app.delete('/kb/articles/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(kbArticles).where(and(eq(kbArticles.id, id), eq(kbArticles.userId, user.sub)))
  deleteBySource(id).catch(() => {})
  return c.json({ ok: true })
})

export default app
