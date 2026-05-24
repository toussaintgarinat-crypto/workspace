import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { generateText } from 'ai'
import { db } from '../../db'
import {
  auditMissions, auditDocuments, auditMissionPoles, auditFindings, auditRecommendations, rapports, poles,
} from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { getModel, resolveLlmConfig } from '../../llm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// ── Helpers ───────────────────────────────────────────────────

async function getMissionWithPoles(missionId: string, userId: string) {
  const [mission] = await db.select().from(auditMissions)
    .where(and(eq(auditMissions.id, missionId), eq(auditMissions.userId, userId))).limit(1)
  if (!mission) return null
  const missionPoles = await db
    .select({ id: poles.id, nom: poles.nom, emoji: poles.emoji, couleur: poles.couleur, type: poles.type })
    .from(auditMissionPoles)
    .innerJoin(poles, eq(auditMissionPoles.poleId, poles.id))
    .where(eq(auditMissionPoles.missionId, missionId))
  return { ...mission, poles: missionPoles }
}

// ── Missions ──────────────────────────────────────────────────

app.get('/poles/:poleId/audit', async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const list = await db.select().from(auditMissions)
    .where(and(eq(auditMissions.poleId, poleId), eq(auditMissions.userId, user.sub)))
    .orderBy(desc(auditMissions.createdAt))

  const withPoles = await Promise.all(list.map(m => getMissionWithPoles(m.id, user.sub)))
  return c.json(withPoles.filter(Boolean))
})

app.post('/poles/:poleId/audit', zValidator('json', z.object({
  titre:       z.string().min(1).max(300),
  description: z.string().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')

  const [mission] = await db.insert(auditMissions).values({
    poleId, userId: user.sub,
    titre: body.titre,
    description: body.description ?? '',
  }).returning()

  // Auto-associer tous les pôles de la même venture
  const [sourcePole] = await db.select().from(poles).where(eq(poles.id, poleId)).limit(1)
  const allPoles = sourcePole?.ventureId
    ? await db.select().from(poles).where(eq(poles.ventureId, sourcePole.ventureId))
    : [sourcePole]

  if (allPoles.length > 0) {
    await db.insert(auditMissionPoles).values(
      allPoles.filter(Boolean).map(p => ({ missionId: mission.id, poleId: p.id }))
    ).onConflictDoNothing()
  }

  return c.json(await getMissionWithPoles(mission.id, user.sub), 201)
})

app.patch('/audit/:id', zValidator('json', z.object({
  titre:       z.string().optional(),
  description: z.string().optional(),
  statut:      z.enum(['brouillon', 'actif', 'termine']).optional(),
})), async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.titre)                       updates.titre = body.titre
  if (body.description !== undefined)   updates.description = body.description
  if (body.statut)                      updates.statut = body.statut
  const [mission] = await db.update(auditMissions).set(updates)
    .where(and(eq(auditMissions.id, id), eq(auditMissions.userId, user.sub)))
    .returning()
  if (!mission) return c.json({ error: 'Not found' }, 404)
  return c.json(await getMissionWithPoles(id, user.sub))
})

app.delete('/audit/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(auditMissions).where(and(eq(auditMissions.id, id), eq(auditMissions.userId, user.sub)))
  return c.json({ ok: true })
})

// ── Pôles d'une mission ───────────────────────────────────────

app.delete('/audit/:missionId/poles/:poleId', async (c) => {
  const { missionId, poleId } = c.req.param()
  const user = c.get('user')
  const [mission] = await db.select().from(auditMissions)
    .where(and(eq(auditMissions.id, missionId), eq(auditMissions.userId, user.sub))).limit(1)
  if (!mission) return c.json({ error: 'Not found' }, 404)
  await db.delete(auditMissionPoles)
    .where(and(eq(auditMissionPoles.missionId, missionId), eq(auditMissionPoles.poleId, poleId)))
  return c.json({ ok: true })
})

// ── Documents ─────────────────────────────────────────────────

app.get('/audit/:missionId/documents', async (c) => {
  const { missionId } = c.req.param()
  const user = c.get('user')
  const list = await db.select().from(auditDocuments)
    .where(and(eq(auditDocuments.missionId, missionId), eq(auditDocuments.userId, user.sub)))
    .orderBy(desc(auditDocuments.createdAt))
  return c.json(list)
})

app.post('/audit/:missionId/documents', zValidator('json', z.object({
  nom:     z.string().min(1),
  type:    z.string().optional(),
  contenu: z.string(),
  analyse: z.string().optional(),
})), async (c) => {
  const { missionId } = c.req.param()
  const user = c.get('user')
  const body = c.req.valid('json')
  const [doc] = await db.insert(auditDocuments).values({
    missionId, userId: user.sub,
    nom: body.nom,
    type: body.type ?? 'pdf',
    contenu: body.contenu,
    analyse: body.analyse ?? '',
  }).returning()
  return c.json(doc, 201)
})

app.delete('/audit/documents/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(auditDocuments).where(and(eq(auditDocuments.id, id), eq(auditDocuments.userId, user.sub)))
  return c.json({ ok: true })
})

// ── Génération rapport IA ─────────────────────────────────────

app.post('/audit/:missionId/generate-report', async (c) => {
  const { missionId } = c.req.param()
  const user = c.get('user')

  const mission = await getMissionWithPoles(missionId, user.sub)
  if (!mission) return c.json({ error: 'Mission introuvable' }, 404)

  const docs = await db.select().from(auditDocuments)
    .where(and(eq(auditDocuments.missionId, missionId), eq(auditDocuments.userId, user.sub)))

  if (docs.length === 0) return c.json({ error: 'Aucun document à analyser' }, 422)

  const llmPreset = await resolveLlmConfig({ poleId: mission.poleId })
  const model = getModel(llmPreset?.provider ?? undefined, llmPreset?.model ?? undefined)

  const docsContext = docs.map(d =>
    `=== ${d.nom} (${d.type}) ===\n${d.contenu || '(contenu vide)'}`
  ).join('\n\n')

  const prompt = `Tu es un expert en audit. Analyse les documents suivants issus de la mission d'audit "${mission.titre}"${mission.description ? ` (${mission.description})` : ''}.

DOCUMENTS :
${docsContext}

Retourne UNIQUEMENT du JSON valide avec cette structure exacte :
{
  "resume_executif": "Résumé exécutif de 2-3 paragraphes en français couvrant les points clés, risques principaux et état général.",
  "findings": [
    { "categorie": "Sécurité|Conformité|Performance|Processus|Finance|Autre", "severite": "faible|moyen|critique", "description": "Description précise du constat", "source": "Nom du document source" }
  ],
  "recommandations": [
    { "priorite": "haute|moyenne|faible", "action": "Action concrète à mener", "statut": "ouvert" }
  ]
}

Règles :
- findings : minimum 3, maximum 20
- recommandations : minimum 2, maximum 15
- severite doit être exactement "faible", "moyen" ou "critique"
- priorite doit être exactement "haute", "moyenne" ou "faible"
- Réponds uniquement en JSON, sans texte avant ou après`

  let parsed: { resume_executif: string; findings: any[]; recommandations: any[] }
  try {
    const { text } = await generateText({ model, prompt, maxTokens: 3000 })
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Pas de JSON dans la réponse LLM')
    parsed = JSON.parse(jsonMatch[0])
  } catch (err: any) {
    return c.json({ error: `Erreur LLM : ${err.message}` }, 500)
  }

  // Supprimer anciens findings/recommendations de cette mission
  await Promise.all([
    db.delete(auditFindings).where(and(eq(auditFindings.missionId, missionId), eq(auditFindings.userId, user.sub))),
    db.delete(auditRecommendations).where(and(eq(auditRecommendations.missionId, missionId), eq(auditRecommendations.userId, user.sub))),
  ])

  const SEVERITE = new Set(['faible', 'moyen', 'critique'])
  const PRIORITE = new Set(['haute', 'moyenne', 'faible'])
  const STATUT   = new Set(['ouvert', 'en_cours', 'resolu'])

  const [savedFindings, savedRecos] = await Promise.all([
    parsed.findings?.length
      ? db.insert(auditFindings).values(
          (parsed.findings as any[]).map(f => ({
            missionId, userId: user.sub,
            categorie:   String(f.categorie || 'Autre').slice(0, 100),
            severite:    SEVERITE.has(f.severite) ? f.severite : 'faible',
            description: String(f.description || ''),
            source:      String(f.source || ''),
          }))
        ).returning()
      : Promise.resolve([]),
    parsed.recommandations?.length
      ? db.insert(auditRecommendations).values(
          (parsed.recommandations as any[]).map(r => ({
            missionId, userId: user.sub,
            priorite: PRIORITE.has(r.priorite) ? r.priorite : 'moyenne',
            action:   String(r.action || ''),
            statut:   STATUT.has(r.statut) ? r.statut : 'ouvert',
          }))
        ).returning()
      : Promise.resolve([]),
  ])

  const titre = `Rapport d'audit — ${mission.titre} — ${new Date().toLocaleDateString('fr-FR')}`
  const contenu = buildReportMarkdown(mission.titre, parsed, savedFindings, savedRecos)

  const [rapport] = await db.insert(rapports).values({
    userId: user.sub, missionId, titre, contenu, type: 'audit',
    periode: new Date().toLocaleDateString('fr-FR'),
  }).returning()

  return c.json({ rapport, findings: savedFindings, recommandations: savedRecos }, 201)
})

app.get('/audit/:missionId/rapport', async (c) => {
  const { missionId } = c.req.param()
  const user = c.get('user')

  const [mission] = await db.select().from(auditMissions)
    .where(and(eq(auditMissions.id, missionId), eq(auditMissions.userId, user.sub))).limit(1)
  if (!mission) return c.json({ error: 'Mission introuvable' }, 404)

  const [rapport] = await db.select().from(rapports)
    .where(and(eq(rapports.missionId, missionId), eq(rapports.userId, user.sub)))
    .orderBy(desc(rapports.createdAt)).limit(1)

  if (!rapport) return c.json(null)

  const [findings, recommandations] = await Promise.all([
    db.select().from(auditFindings)
      .where(and(eq(auditFindings.missionId, missionId), eq(auditFindings.userId, user.sub)))
      .orderBy(auditFindings.createdAt),
    db.select().from(auditRecommendations)
      .where(and(eq(auditRecommendations.missionId, missionId), eq(auditRecommendations.userId, user.sub)))
      .orderBy(auditRecommendations.createdAt),
  ])

  return c.json({ rapport, findings, recommandations })
})

// ── Helpers ───────────────────────────────────────────────────

function buildReportMarkdown(
  titre: string,
  parsed: { resume_executif: string; findings: any[]; recommandations: any[] },
  findings: any[],
  recos: any[],
): string {
  const SEV_ICON: Record<string, string> = { critique: '🔴', moyen: '🟠', faible: '🟡' }
  const PRIO_ICON: Record<string, string> = { haute: '🔴', moyenne: '🟠', faible: '🟢' }

  const findingsByCategory: Record<string, any[]> = {}
  for (const f of findings) {
    if (!findingsByCategory[f.categorie]) findingsByCategory[f.categorie] = []
    findingsByCategory[f.categorie].push(f)
  }

  const findingsSection = Object.entries(findingsByCategory).map(([cat, items]) =>
    `### ${cat}\n${items.map(f => `- ${SEV_ICON[f.severite] || '⚪'} **[${f.severite.toUpperCase()}]** ${f.description}${f.source ? ` *(${f.source})*` : ''}`).join('\n')}`
  ).join('\n\n')

  const recosSection = recos.map((r, i) =>
    `${i + 1}. ${PRIO_ICON[r.priorite] || '⚪'} **[${r.priorite.toUpperCase()}]** ${r.action}`
  ).join('\n')

  return `# Rapport d'audit — ${titre}

*Généré le ${new Date().toLocaleString('fr-FR')}*

## 📋 Résumé exécutif

${parsed.resume_executif}

## 🔍 Constats (${findings.length})

${findingsSection || '*Aucun constat*'}

## ✅ Recommandations (${recos.length})

${recosSection || '*Aucune recommandation*'}
`
}

export default app
