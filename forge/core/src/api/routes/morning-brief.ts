import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { briefConfigs, briefs, poles, kbArticles, incidents } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/brief/config', async (c) => {
  const user = c.get('user')
  const [config] = await db.select().from(briefConfigs)
    .where(eq(briefConfigs.userId, user.sub)).limit(1)
  return c.json(config ?? { enabled: true, heureUtc: '07:00', joursSemaine: '[1,2,3,4,5]' })
})

app.put('/brief/config', zValidator('json', z.object({
  enabled:      z.boolean().optional(),
  heureUtc:     z.string().optional(),
  joursSemaine: z.array(z.number()).optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const [existing] = await db.select().from(briefConfigs)
    .where(eq(briefConfigs.userId, user.sub)).limit(1)
  const update = {
    ...body,
    joursSemaine: body.joursSemaine ? JSON.stringify(body.joursSemaine) : undefined,
    updatedAt: new Date(),
  }
  if (existing) {
    const [u] = await db.update(briefConfigs).set(update)
      .where(eq(briefConfigs.id, existing.id)).returning()
    return c.json(u)
  }
  const [created] = await db.insert(briefConfigs).values({
    userId: user.sub, orgId: orgId ?? undefined,
    enabled: body.enabled ?? true, heureUtc: body.heureUtc ?? '07:00',
    joursSemaine: body.joursSemaine ? JSON.stringify(body.joursSemaine) : '[1,2,3,4,5]',
  }).returning()
  return c.json(created, 201)
})

app.get('/briefs', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const rows = await db.select().from(briefs)
    .where(and(
      eq(briefs.userId, user.sub),
      orgId ? eq(briefs.orgId, orgId) : sql`1=1`,
    ))
    .orderBy(desc(briefs.createdAt))
    .limit(50)
  return c.json(rows)
})

app.post('/briefs/generate', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const userPoles = await db.select({ nom: poles.nom, emoji: poles.emoji })
    .from(poles).where(eq(poles.ownerId, user.sub)).limit(5)
  const recentIncidents = await db.select({ titre: incidents.titre, severite: incidents.severite })
    .from(incidents).where(eq(incidents.userId, user.sub))
    .orderBy(desc(incidents.createdAt)).limit(3)

  const now = new Date()
  const titre = `Brief du ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`
  const contenu = `# ${titre}

## 📊 Pôles actifs
${userPoles.map(p => `- ${p.emoji} **${p.nom}**`).join('\n') || '- Aucun pôle configuré'}

## 🚨 Incidents récents
${recentIncidents.map(i => `- [${i.severite?.toUpperCase()}] ${i.titre}`).join('\n') || '- Aucun incident ouvert'}

## 📋 À faire aujourd'hui
- Vérifier les décisions N0 en attente
- Passer en revue les métriques SLO
- Consulter le pipeline CRM

*Brief généré automatiquement le ${now.toLocaleString('fr-FR')}*`

  const [brief] = await db.insert(briefs).values({
    userId: user.sub, orgId: orgId ?? undefined,
    titre, contenu, type: 'morning',
  }).returning()
  return c.json(brief, 201)
})

app.patch('/briefs/:id/lu', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [brief] = await db.update(briefs).set({ lu: true })
    .where(and(eq(briefs.id, id), eq(briefs.userId, user.sub)))
    .returning()
  return c.json(brief)
})

export default app
