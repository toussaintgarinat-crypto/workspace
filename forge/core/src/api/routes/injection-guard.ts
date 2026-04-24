import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { injectionLogs } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

const PATTERNS = [
  { pattern: /ignore previous instructions/i, raison: 'Ignore instructions pattern' },
  { pattern: /you are now/i, raison: 'Role override attempt' },
  { pattern: /jailbreak/i, raison: 'Jailbreak keyword' },
  { pattern: /system prompt/i, raison: 'System prompt exfiltration' },
  { pattern: /disregard|forget all/i, raison: 'Context erasure attempt' },
  { pattern: /\bDAN\b/i, raison: 'DAN prompt' },
]

app.post('/injection-guard/check', zValidator('json', z.object({
  input: z.string(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const { input } = c.req.valid('json')
  const match = PATTERNS.find(p => p.pattern.test(input))
  const flagged = !!match
  const [log] = await db.insert(injectionLogs).values({
    userId: user.sub, orgId: orgId ?? undefined,
    input: input.slice(0, 1000), flagged, raison: match?.raison ?? '',
  }).returning()
  return c.json({ flagged, raison: match?.raison ?? '', id: log.id })
})

app.get('/injection-guard/logs', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const onlyFlagged = c.req.query('flagged') === 'true'
  const logs = await db.select().from(injectionLogs)
    .where(and(
      eq(injectionLogs.userId, user.sub),
      orgId ? eq(injectionLogs.orgId, orgId) : sql`1=1`,
      onlyFlagged ? eq(injectionLogs.flagged, true) : sql`1=1`,
    ))
    .orderBy(desc(injectionLogs.createdAt))
    .limit(200)
  return c.json(logs)
})

export default app
