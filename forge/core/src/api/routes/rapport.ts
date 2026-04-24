import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { rapports, poles, budgetEntries, crmLeads, incidents } from '../../db/schema'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/rapports', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const type = c.req.query('type')
  const rows = await db.select().from(rapports)
    .where(and(
      eq(rapports.userId, user.sub),
      orgId ? eq(rapports.orgId, orgId) : sql`1=1`,
      type ? eq(rapports.type, type as any) : sql`1=1`,
    ))
    .orderBy(desc(rapports.createdAt))
  return c.json(rows)
})

app.post('/rapports/generate', zValidator('json', z.object({
  type:    z.enum(['weekly', 'monthly', 'audit', 'custom']).optional(),
  periode: z.string().optional(),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const body = c.req.valid('json')
  const type = body.type ?? 'weekly'
  const now = new Date()
  const depuis = new Date(now.getTime() - (type === 'monthly' ? 30 : 7) * 24 * 60 * 60 * 1000)

  const [userPoles, budget, leads, openIncidents] = await Promise.all([
    db.select().from(poles).where(eq(poles.ownerId, user.sub)),
    db.select({ type: budgetEntries.type, total: sql<number>`SUM(${budgetEntries.montant})` })
      .from(budgetEntries).where(and(eq(budgetEntries.userId, user.sub), gte(budgetEntries.date, depuis)))
      .groupBy(budgetEntries.type),
    db.select().from(crmLeads).where(and(eq(crmLeads.userId, user.sub), gte(crmLeads.createdAt, depuis))),
    db.select().from(incidents).where(and(eq(incidents.userId, user.sub), eq(incidents.statut, 'ouvert'))),
  ])

  const recettes = budget.find(b => b.type === 'recette')?.total ?? 0
  const depenses = budget.find(b => b.type === 'depense')?.total ?? 0
  const periode = body.periode ?? `${depuis.toLocaleDateString('fr-FR')} - ${now.toLocaleDateString('fr-FR')}`
  const titre = `Rapport ${type === 'weekly' ? 'hebdomadaire' : type === 'monthly' ? 'mensuel' : type} — ${periode}`

  const contenu = `# ${titre}

## 📊 Vue d'ensemble
- **Pôles actifs** : ${userPoles.length}
- **Période** : ${periode}

## 💰 Finance
- Recettes : ${recettes.toLocaleString('fr-FR')} €
- Dépenses : ${depenses.toLocaleString('fr-FR')} €
- Solde : **${(recettes - depenses).toLocaleString('fr-FR')} €**

## 🤝 CRM
- Nouveaux leads : ${leads.length}
- Leads gagnés : ${leads.filter(l => l.statut === 'gagne').length}
- Pipeline : ${leads.filter(l => l.statut === 'qualifie').length} qualifiés

## 🚨 Incidents
- Incidents ouverts : ${openIncidents.length}
${openIncidents.slice(0, 3).map(i => `  - [${i.severite?.toUpperCase()}] ${i.titre}`).join('\n')}

*Rapport généré automatiquement le ${now.toLocaleString('fr-FR')}*`

  const [rapport] = await db.insert(rapports).values({
    userId: user.sub, orgId: orgId ?? undefined,
    titre, contenu, type, periode,
  }).returning()
  return c.json(rapport, 201)
})

app.delete('/rapports/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(rapports)
    .where(and(eq(rapports.id, id), eq(rapports.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
