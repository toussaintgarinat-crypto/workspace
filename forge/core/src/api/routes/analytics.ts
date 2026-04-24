import { Hono } from 'hono'
import { db } from '../../db'
import {
  poles, sessions, messages, crmLeads, incidents, budgetEntries,
  agentRuns, kbArticles, sprints, tasks, blackboardEvents
} from '../../db/schema'
import { eq, and, desc, count, gte, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/analytics', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const depuis30j = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalPoles, totalSessions, totalMessages,
    totalLeads, leadsGagnes, incidentsOuverts,
    totalKb, totalSprints,
  ] = await Promise.all([
    db.select({ count: count() }).from(poles).where(eq(poles.ownerId, user.sub)),
    db.select({ count: count() }).from(sessions)
      .where(and(eq(sessions.userId, user.sub), gte(sessions.createdAt, depuis30j))),
    db.select({ count: count() }).from(messages)
      .where(and(
        eq(messages.role, 'user'),
        sql`${messages.sessionId} IN (SELECT id FROM sessions WHERE user_id = ${user.sub})`
      )),
    db.select({ count: count() }).from(crmLeads).where(eq(crmLeads.userId, user.sub)),
    db.select({ count: count() }).from(crmLeads)
      .where(and(eq(crmLeads.userId, user.sub), eq(crmLeads.statut, 'gagne'))),
    db.select({ count: count() }).from(incidents)
      .where(and(eq(incidents.userId, user.sub), eq(incidents.statut, 'ouvert'))),
    db.select({ count: count() }).from(kbArticles).where(eq(kbArticles.userId, user.sub)),
    db.select({ count: count() }).from(sprints).where(eq(sprints.userId, user.sub)),
  ])

  const budget = await db.select({
    type: budgetEntries.type,
    total: sql<number>`SUM(${budgetEntries.montant})`,
  }).from(budgetEntries)
    .where(and(eq(budgetEntries.userId, user.sub), gte(budgetEntries.date, depuis30j)))
    .groupBy(budgetEntries.type)

  const recettes = budget.find(b => b.type === 'recette')?.total ?? 0
  const depenses = budget.find(b => b.type === 'depense')?.total ?? 0

  const recentEvents = await db.select().from(blackboardEvents)
    .where(gte(blackboardEvents.createdAt, depuis30j))
    .orderBy(desc(blackboardEvents.createdAt))
    .limit(10)

  return c.json({
    poles: totalPoles[0].count,
    sessions30j: totalSessions[0].count,
    messages: totalMessages[0].count,
    crm: { total: totalLeads[0].count, gagnes: leadsGagnes[0].count },
    incidentsOuverts: incidentsOuverts[0].count,
    kb: totalKb[0].count,
    sprints: totalSprints[0].count,
    budget: { recettes, depenses, solde: recettes - depenses },
    recentEvents,
  })
})

export default app
