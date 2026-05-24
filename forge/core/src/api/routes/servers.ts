import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { managedServers, deployedInstances } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import { encryptKey, decryptKey } from '../../services/deployService'
import { maskKey } from '../../config/crypto'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// ── Liste des serveurs du parc ────────────────────────────────

app.get('/servers', async (c) => {
  const user = c.get('user')
  const list = await db.select({
    id: managedServers.id, label: managedServers.label, ip: managedServers.ip,
    sshUser: managedServers.sshUser, region: managedServers.region,
    status: managedServers.status, instanceId: managedServers.instanceId,
    createdAt: managedServers.createdAt,
  }).from(managedServers).where(eq(managedServers.userId, user.sub))
  return c.json(list)
})

// ── Ajouter un serveur ────────────────────────────────────────

app.post('/servers', zValidator('json', z.object({
  label:   z.string().min(1).max(100),
  ip:      z.string().min(7),
  sshKey:  z.string().min(20),
  sshUser: z.string().default('root'),
  region:  z.string().optional(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')

  const encrypted = await encryptKey(body.sshKey)
  const [srv] = await db.insert(managedServers).values({
    userId:  user.sub,
    label:   body.label,
    ip:      body.ip,
    sshKey:  encrypted,
    sshUser: body.sshUser,
    region:  body.region ?? '',
    status:  'libre',
  }).returning()

  return c.json({ ...srv, sshKey: maskKey(body.sshKey) }, 201)
})

// ── Supprimer un serveur ──────────────────────────────────────

app.delete('/servers/:id', async (c) => {
  const { id } = c.req.param()
  const user    = c.get('user')

  const [srv] = await db.select().from(managedServers)
    .where(and(eq(managedServers.id, id), eq(managedServers.userId, user.sub))).limit(1)
  if (!srv) return c.json({ error: 'Not found' }, 404)
  if (srv.status === 'occupe') return c.json({ error: 'Ce serveur est occupé par une instance active.' }, 409)

  await db.delete(managedServers).where(eq(managedServers.id, id))
  return c.json({ ok: true })
})

// ── Instances déployées d'une mission ─────────────────────────

app.get('/audit/:missionId/deployments', async (c) => {
  const { missionId } = c.req.param()
  const user = c.get('user')
  const list = await db.select({
    id: deployedInstances.id, missionId: deployedInstances.missionId,
    serverIp: deployedInstances.serverIp, domain: deployedInstances.domain,
    domainMode: deployedInstances.domainMode, status: deployedInstances.status,
    adminEmail: deployedInstances.adminEmail, notes: deployedInstances.notes,
    deployedAt: deployedInstances.deployedAt, createdAt: deployedInstances.createdAt,
  }).from(deployedInstances)
    .where(and(eq(deployedInstances.missionId, missionId), eq(deployedInstances.userId, user.sub)))
  return c.json(list)
})

export default app
