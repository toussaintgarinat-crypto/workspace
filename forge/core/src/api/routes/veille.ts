import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { veilleSources, veilleArticles } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// Sources
app.get('/veille/sources', async (c) => {
  const user = c.get('user')
  return c.json(await db.select().from(veilleSources).where(eq(veilleSources.userId, user.sub)).orderBy(desc(veilleSources.createdAt)))
})

app.post('/veille/sources', zValidator('json', z.object({
  nom:  z.string().min(1),
  url:  z.string().url(),
  type: z.enum(['rss', 'web']).default('rss'),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [src] = await db.insert(veilleSources).values({ userId: user.sub, ...body }).returning()
  return c.json(src, 201)
})

app.patch('/veille/sources/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json()
  const [src] = await db.update(veilleSources).set(body)
    .where(and(eq(veilleSources.id, id), eq(veilleSources.userId, user.sub))).returning()
  return c.json(src)
})

app.delete('/veille/sources/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(veilleSources).where(and(eq(veilleSources.id, id), eq(veilleSources.userId, user.sub)))
  return c.json({ ok: true })
})

// Articles
app.get('/veille/articles', async (c) => {
  const user = c.get('user')
  const sourceId = c.req.query('sourceId')
  const where = sourceId
    ? and(eq(veilleArticles.userId, user.sub), eq(veilleArticles.sourceId, sourceId))
    : eq(veilleArticles.userId, user.sub)
  return c.json(await db.select().from(veilleArticles).where(where).orderBy(desc(veilleArticles.createdAt)).limit(100))
})

// Mark as read
app.patch('/veille/articles/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json()
  const [a] = await db.update(veilleArticles).set(body)
    .where(and(eq(veilleArticles.id, id), eq(veilleArticles.userId, user.sub))).returning()
  return c.json(a)
})

// Fetch RSS manually (lightweight parser)
app.post('/veille/fetch/:sourceId', async (c) => {
  const { sourceId } = c.req.param()
  const user = c.get('user')
  const [src] = await db.select().from(veilleSources)
    .where(and(eq(veilleSources.id, sourceId), eq(veilleSources.userId, user.sub)))
  if (!src) return c.json({ error: 'Source not found' }, 404)

  try {
    const res = await fetch(src.url, { headers: { 'User-Agent': 'Forge/1.0 RSS Reader' }, signal: AbortSignal.timeout(10_000) })
    const text = await res.text()

    // Simple RSS XML parser
    const items: Array<{ titre: string; url: string; publishedAt: string }> = []
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
    let match
    while ((match = itemRegex.exec(text)) !== null) {
      const item = match[1]
      const title = item.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() ?? ''
      const link  = item.match(/<link[^>]*>(.*?)<\/link>/i)?.[1]?.trim()
              ?? item.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/i)?.[1]?.trim() ?? ''
      const pubDate = item.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i)?.[1]?.trim() ?? ''
      if (title && link) items.push({ titre: title, url: link, publishedAt: pubDate })
    }

    // Insert new articles (skip duplicates by url)
    let added = 0
    for (const item of items.slice(0, 20)) {
      const existing = await db.select().from(veilleArticles)
        .where(and(eq(veilleArticles.userId, user.sub), eq(veilleArticles.url, item.url)))
      if (existing.length === 0) {
        await db.insert(veilleArticles).values({ userId: user.sub, sourceId: src.id, ...item })
        added++
      }
    }

    return c.json({ added, total: items.length })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default app
