import { Hono } from 'hono'
import { db } from '../../db'
import { kbArticles, sessions, crmLeads, incidents, contrats, devTasks } from '../../db/schema'
import { eq, and, like, or, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/search', async (c) => {
  const user = c.get('user')
  const q = c.req.query('q') ?? ''
  if (!q.trim()) return c.json({ results: [] })
  const pattern = `%${q}%`

  const [kbResults, sessionResults, leadResults, incidentResults, contratResults] = await Promise.all([
    db.select({ id: kbArticles.id, titre: kbArticles.titre, type: kbArticles.tags, entity: kbArticles.contenu })
      .from(kbArticles)
      .where(and(eq(kbArticles.userId, user.sub), or(like(kbArticles.titre, pattern), like(kbArticles.contenu, pattern))))
      .limit(5),
    db.select({ id: sessions.id, titre: sessions.name, entity: sessions.name })
      .from(sessions)
      .where(and(eq(sessions.userId, user.sub), like(sessions.name, pattern)))
      .limit(5),
    db.select({ id: crmLeads.id, titre: crmLeads.nom, entity: crmLeads.entreprise })
      .from(crmLeads)
      .where(and(eq(crmLeads.userId, user.sub), or(like(crmLeads.nom, pattern), like(crmLeads.entreprise, pattern))))
      .limit(5),
    db.select({ id: incidents.id, titre: incidents.titre, entity: incidents.description })
      .from(incidents)
      .where(and(eq(incidents.userId, user.sub), like(incidents.titre, pattern)))
      .limit(5),
    db.select({ id: contrats.id, titre: contrats.titre, entity: contrats.parties })
      .from(contrats)
      .where(and(eq(contrats.userId, user.sub), like(contrats.titre, pattern)))
      .limit(5),
  ])

  return c.json({
    results: [
      ...kbResults.map(r => ({ ...r, category: 'KB' })),
      ...sessionResults.map(r => ({ ...r, category: 'Conversation' })),
      ...leadResults.map(r => ({ ...r, category: 'CRM' })),
      ...incidentResults.map(r => ({ ...r, category: 'Incident' })),
      ...contratResults.map(r => ({ ...r, category: 'Contrat' })),
    ]
  })
})

export default app
