import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { imapConfigs, imapEmails } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { encrypt, decrypt } from '../../config/crypto'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/imap/configs', async (c) => {
  const user = c.get('user')
  const configs = await db.select({
    id: imapConfigs.id, host: imapConfigs.host, port: imapConfigs.port,
    email: imapConfigs.email, actif: imapConfigs.actif, createdAt: imapConfigs.createdAt,
  }).from(imapConfigs).where(eq(imapConfigs.userId, user.sub))
  return c.json(configs)
})

app.post('/imap/configs', zValidator('json', z.object({
  host:     z.string().min(1),
  port:     z.number().int().optional(),
  email:    z.string().email(),
  password: z.string().min(1),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const passwordEncrypted = await encrypt(body.password)
  const [config] = await db.insert(imapConfigs).values({
    userId: user.sub, host: body.host, port: body.port ?? 993,
    email: body.email, passwordEncrypted,
  }).returning()
  return c.json({ id: config.id, host: config.host, email: config.email, actif: config.actif }, 201)
})

app.delete('/imap/configs/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(imapConfigs)
    .where(and(eq(imapConfigs.id, id), eq(imapConfigs.userId, user.sub)))
  return c.json({ ok: true })
})

app.get('/imap/emails', async (c) => {
  const user = c.get('user')
  const configId = c.req.query('configId')
  const configs = await db.select({ id: imapConfigs.id }).from(imapConfigs)
    .where(eq(imapConfigs.userId, user.sub))
  const configIds = configs.map(c => c.id)
  if (!configIds.length) return c.json([])
  const emails = await db.select().from(imapEmails)
    .where(configId ? eq(imapEmails.configId, configId) : eq(imapEmails.configId, configIds[0]))
    .orderBy(desc(imapEmails.createdAt))
    .limit(100)
  return c.json(emails)
})

export default app
