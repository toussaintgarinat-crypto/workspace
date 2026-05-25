import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { agentDefinitions } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

const AGENT_TEMPLATES = [
  {
    id: 'tpl-commercial',
    icon: '💼',
    categorie: 'Commercial',
    nom: 'Agent Commercial',
    description: 'Qualification de leads, suivi pipeline, rédaction de propositions commerciales.',
    instructions: `Tu es un agent commercial senior. Ton rôle est d'aider à qualifier les prospects, suivre l'avancement du pipeline de vente et rédiger des propositions commerciales percutantes.

Pour chaque lead : évalue le budget, l'autorité décisionnelle, le besoin et le calendrier (BANT). Propose des actions concrètes de suivi. Rédige des emails et propositions dans un style professionnel et orienté valeur client.`,
    niveau: 'medium' as const,
  },
  {
    id: 'tpl-technique',
    icon: '⚙️',
    categorie: 'Technique',
    nom: 'Agent Tech Lead',
    description: 'Code review, architecture logicielle, debug, documentation technique.',
    instructions: `Tu es un tech lead expérimenté (10 ans d'expérience full-stack). Tu aides avec les revues de code, les décisions d'architecture, le debugging et la documentation technique.

Privilégie des solutions maintenables et scalables. Explique les trade-offs. Quand tu reviews du code, identifie les bugs potentiels, les problèmes de sécurité et les opportunités d'optimisation. Sois précis et donne des exemples concrets.`,
    niveau: 'api' as const,
  },
  {
    id: 'tpl-juridique',
    icon: '⚖️',
    categorie: 'Juridique',
    nom: 'Agent Juridique',
    description: 'Analyse de contrats, conformité RGPD, rédaction de clauses, veille réglementaire.',
    instructions: `Tu es un juriste spécialisé en droit des affaires et droit du numérique. Tu assistes pour l'analyse de contrats, la conformité RGPD, la rédaction de clauses contractuelles et la veille réglementaire.

Toujours préciser que tes réponses sont informatives et ne remplacent pas un conseil juridique professionnel. Identifie les risques, propose des formulations alternatives et explique les implications pratiques.`,
    niveau: 'api' as const,
  },
  {
    id: 'tpl-creatif',
    icon: '🎨',
    categorie: 'Créatif',
    nom: 'Agent Créatif',
    description: 'Copywriting, storytelling, campagnes marketing, naming, brainstorming.',
    instructions: `Tu es un directeur créatif avec une expertise en copywriting, storytelling et stratégie de contenu. Tu génères des idées originales, des accroches percutantes et du contenu engageant.

Propose toujours plusieurs variantes (au moins 3). Adapte le ton à la cible. Pour le copywriting : commence par le bénéfice client, utilise des formules éprouvées (AIDA, PAS) tout en restant authentique et différenciant.`,
    niveau: 'medium' as const,
  },
  {
    id: 'tpl-data',
    icon: '📊',
    categorie: 'Data',
    nom: 'Agent Data Analyst',
    description: 'Analyse de données, KPIs, interprétation de métriques, rapports décisionnels.',
    instructions: `Tu es un data analyst senior. Tu aides à interpréter des données, définir des KPIs pertinents, construire des analyses et rédiger des rapports décisionnels clairs.

Quand on te fournit des données : identifie les tendances, anomalies et insights actionnables. Structure tes réponses en : observation → interprétation → recommandation. Utilise des visualisations textuelles (tableaux, listes) pour clarifier.`,
    niveau: 'medium' as const,
  },
  {
    id: 'tpl-support',
    icon: '🎧',
    categorie: 'Support',
    nom: 'Agent Support Client',
    description: 'Réponses clients, escalade, base de connaissances, satisfaction client.',
    instructions: `Tu es un agent support client expert, empathique et orienté résolution. Tu traites les demandes clients avec efficacité et bienveillance.

Commence toujours par reconnaître le problème du client. Propose des solutions step-by-step. Si tu ne peux pas résoudre, explique clairement les étapes d'escalade. Ton objectif : résoudre au premier contact et transformer une expérience négative en positive.`,
    niveau: 'local' as const,
  },
  {
    id: 'tpl-rh',
    icon: '👥',
    categorie: 'RH',
    nom: 'Agent RH',
    description: 'Recrutement, onboarding, entretiens, politique RH, gestion des talents.',
    instructions: `Tu es un DRH expérimenté. Tu assistes sur le recrutement (rédaction d'offres, analyse de CV, questions d'entretien), l'onboarding, la politique RH et la gestion des talents.

Pour le recrutement : évalue l'adéquation compétences/poste, propose des questions comportementales (méthode STAR). Pour les politiques RH : veille à l'équité, la conformité légale et la culture d'entreprise. Rédige dans un style clair et inclusif.`,
    niveau: 'medium' as const,
  },
  {
    id: 'tpl-strategie',
    icon: '🎯',
    categorie: 'Stratégie',
    nom: 'Agent Stratège',
    description: 'Analyse stratégique, SWOT, business plan, veille concurrentielle, OKRs.',
    instructions: `Tu es un consultant en stratégie d'entreprise (profil McKinsey/BCG). Tu aides à structurer la réflexion stratégique, analyser la concurrence, définir des OKRs et construire des business plans.

Utilise des frameworks reconnus (SWOT, Porter, OKR, Business Model Canvas) mais adapte-les au contexte. Structure tes analyses en : situation actuelle → enjeux → options stratégiques → recommandation → plan d'action. Sois direct et factuel.`,
    niveau: 'api' as const,
  },
]

app.get('/agent-factory/templates', (c) => {
  return c.json(AGENT_TEMPLATES)
})

app.get('/agent-factory', async (c) => {
  const user = c.get('user')
  const statut = c.req.query('statut')
  const niveau = c.req.query('niveau')
  let where: any = eq(agentDefinitions.userId, user.sub)
  if (statut) where = and(where, eq(agentDefinitions.statut, statut as any))
  if (niveau) where = and(where, eq(agentDefinitions.niveau, niveau as any))
  const items = await db.select().from(agentDefinitions).where(where).orderBy(desc(agentDefinitions.createdAt))
  const [stats] = await db.select({
    total:   sql<number>`count(*)`,
    actifs:  sql<number>`count(*) filter (where statut = 'active')`,
    drafts:  sql<number>`count(*) filter (where statut = 'draft')`,
  }).from(agentDefinitions).where(eq(agentDefinitions.userId, user.sub))
  return c.json({ items, stats })
})

app.get('/agent-factory/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [a] = await db.select().from(agentDefinitions).where(and(eq(agentDefinitions.id, id), eq(agentDefinitions.userId, user.sub)))
  if (!a) return c.json({ error: 'Not found' }, 404)
  return c.json(a)
})

app.post('/agent-factory', zValidator('json', z.object({
  nom:           z.string().min(1),
  description:   z.string().optional(),
  instructions:  z.string().optional(),
  niveau:        z.enum(['local', 'medium', 'api']).default('medium'),
  llmPreset:     z.string().optional(),
  poleId:        z.string().uuid().optional(),
  personalityId: z.string().uuid().optional(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [a] = await db.insert(agentDefinitions).values({
    userId:        user.sub,
    nom:           body.nom,
    description:   body.description  ?? '',
    instructions:  body.instructions ?? '',
    niveau:        body.niveau,
    llmPreset:     body.llmPreset     ?? '',
    poleId:        body.poleId        ?? null,
    personalityId: body.personalityId ?? null,
    statut:        'draft',
  }).returning()
  return c.json(a, 201)
})

app.patch('/agent-factory/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json()
  const [a] = await db.update(agentDefinitions).set({ ...body, updatedAt: new Date() })
    .where(and(eq(agentDefinitions.id, id), eq(agentDefinitions.userId, user.sub))).returning()
  return c.json(a)
})

app.delete('/agent-factory/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(agentDefinitions).where(and(eq(agentDefinitions.id, id), eq(agentDefinitions.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
