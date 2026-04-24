import { Hono } from 'hono'
import { db } from '../../db'
import { auditLogs } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/audit-logs', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const entite = c.req.query('entite')
  const logs = await db.select().from(auditLogs)
    .where(and(
      eq(auditLogs.userId, user.sub),
      orgId ? eq(auditLogs.orgId, orgId) : sql`1=1`,
      entite ? eq(auditLogs.entite, entite) : sql`1=1`,
    ))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200)
  return c.json(logs)
})

export async function logAudit(
  userId: string, orgId: string | undefined, action: string,
  entite: string, entiteId: string, pole: string = '', details: object = {}
) {
  await db.insert(auditLogs).values({
    userId, orgId, action, entite, entiteId, pole,
    details: JSON.stringify(details),
  })
}

export default app
