import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import {
  auditMissions, auditFindings, auditRecommendations, rapports,
  deployedInstances, managedServers,
} from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { encryptKey } from '../../services/deployService'
import { runDeploy } from '../../services/deployService'
import type { JWTPayload } from '../middleware/auth'
import bcrypt from 'bcryptjs'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// ── POST /audit/:missionId/deploy ─────────────────────────────

app.post('/audit/:missionId/deploy', zValidator('json', z.object({
  // Mode serveur
  serverMode:   z.enum(['parc', 'custom']),
  serverId:     z.string().uuid().optional(),  // parc
  serverIp:     z.string().optional(),          // custom
  sshKey:       z.string().optional(),          // custom
  sshUser:      z.string().default('root'),
  // Mode domaine
  domainMode:   z.enum(['cloudflare', 'manual']),
  domain:       z.string().default(''),
  // Admin client
  adminEmail:    z.string().email(),
  adminPassword: z.string().min(8),
})), async (c) => {
  const { missionId } = c.req.param()
  const user  = c.get('user')
  const body  = c.req.valid('json')

  // Vérifier que la mission existe et appartient à l'utilisateur
  const [mission] = await db.select().from(auditMissions)
    .where(and(eq(auditMissions.id, missionId), eq(auditMissions.userId, user.sub))).limit(1)
  if (!mission) return c.json({ error: 'Mission introuvable' }, 404)

  // Résoudre IP + clé SSH selon le mode
  let serverIp:      string
  let sshKeyEncrypted: string
  let sshUser = body.sshUser

  if (body.serverMode === 'parc') {
    if (!body.serverId) return c.json({ error: 'serverId requis pour le mode parc' }, 400)
    const [srv] = await db.select().from(managedServers)
      .where(and(eq(managedServers.id, body.serverId), eq(managedServers.userId, user.sub))).limit(1)
    if (!srv)             return c.json({ error: 'Serveur introuvable' }, 404)
    if (srv.status === 'occupe') return c.json({ error: 'Ce serveur est déjà occupé' }, 409)
    serverIp        = srv.ip
    sshKeyEncrypted = srv.sshKey
    sshUser         = srv.sshUser ?? 'root'
  } else {
    if (!body.serverIp || !body.sshKey) return c.json({ error: 'serverIp et sshKey requis pour le mode custom' }, 400)
    serverIp        = body.serverIp
    sshKeyEncrypted = await encryptKey(body.sshKey)
  }

  // Charger les données d'audit
  const [findings, recos, rapportRow] = await Promise.all([
    db.select().from(auditFindings)
      .where(and(eq(auditFindings.missionId, missionId), eq(auditFindings.userId, user.sub))),
    db.select().from(auditRecommendations)
      .where(and(eq(auditRecommendations.missionId, missionId), eq(auditRecommendations.userId, user.sub))),
    db.select().from(rapports)
      .where(and(eq(rapports.missionId, missionId), eq(rapports.userId, user.sub)))
      .orderBy(desc(rapports.createdAt)).limit(1),
  ])

  // Créer l'enregistrement instance (status: deploying)
  const adminHash = await bcrypt.hash(body.adminPassword, 10)
  const [instance] = await db.insert(deployedInstances).values({
    missionId, userId: user.sub,
    serverIp, sshKey: sshKeyEncrypted, sshUser,
    domain: body.domain, domainMode: body.domainMode,
    adminEmail: body.adminEmail, adminPasswordHash: adminHash,
    status: 'deploying',
  }).returning()

  // Marquer le serveur parc comme occupé
  if (body.serverMode === 'parc' && body.serverId) {
    await db.update(managedServers).set({ status: 'occupe', instanceId: instance.id })
      .where(eq(managedServers.id, body.serverId))
  }

  // Stream SSE du déploiement
  c.header('Content-Type', 'text/event-stream')
  c.header('Cache-Control', 'no-cache')
  c.header('X-Accel-Buffering', 'no')

  return stream(c, async (s) => {
    const sse = async (msg: string, step: number, total: number) => {
      await s.write(`data: ${JSON.stringify({ msg, step, total })}\n\n`)
    }

    try {
      await runDeploy({
        instanceId:    instance.id,
        serverIp,
        sshKeyEncrypted,
        sshUser,
        domain:        body.domain,
        domainMode:    body.domainMode,
        adminEmail:    body.adminEmail,
        adminPassword: body.adminPassword,
        missionData: {
          titre:       mission.titre,
          description: mission.description ?? '',
          findings:    findings.map(f => ({
            categorie: f.categorie ?? '', severite: f.severite ?? 'faible',
            description: f.description, source: f.source ?? '',
          })),
          recos: recos.map(r => ({
            priorite: r.priorite ?? 'moyenne', action: r.action, statut: r.statut ?? 'ouvert',
          })),
          rapport: rapportRow[0]?.contenu ?? '',
        },
      }, sse)

      await db.update(deployedInstances).set({ status: 'ready', deployedAt: new Date() })
        .where(eq(deployedInstances.id, instance.id))

      await s.write(`data: ${JSON.stringify({ done: true, instanceId: instance.id, domain: body.domain })}\n\n`)
    } catch (err: any) {
      await db.update(deployedInstances).set({ status: 'error', notes: err.message })
        .where(eq(deployedInstances.id, instance.id))

      // Libérer le serveur parc en cas d'erreur
      if (body.serverMode === 'parc' && body.serverId) {
        await db.update(managedServers).set({ status: 'libre', instanceId: null })
          .where(eq(managedServers.id, body.serverId))
      }

      await s.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    }
  })
})

export default app
