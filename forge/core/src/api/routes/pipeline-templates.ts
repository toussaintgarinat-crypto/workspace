import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { streamText } from 'ai'
import { db } from '../../db'
import { pipelineTemplates, taskDagItems } from '../../db/schema'
import { eq, and, or, isNull, desc } from 'drizzle-orm'
import { getModel } from '../../llm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// ── Hardcoded system templates ───────────────────────────────
const PIPELINE_TEMPLATES = [
  {
    id: 'sys-brief-analyse-rapport',
    userId: null,
    nom: 'Brief → Analyse → Rapport',
    description: 'Pipeline linéaire classique : cadrage de la demande, analyse approfondie, livrable final.',
    icon: '📋',
    categorie: 'Productivité',
    isPublic: true,
    nodes: JSON.stringify([
      { id: 'n1', type: 'promptNode', position: { x: 50,  y: 150 }, data: { label: 'Brief', criticite: 'haute',  nodeType: 'prompt', promptText: 'Analyse la demande et rédige un brief structuré : contexte, objectifs, contraintes, livrables attendus.', agentOwner: '' } },
      { id: 'n2', type: 'promptNode', position: { x: 320, y: 150 }, data: { label: 'Analyse', criticite: 'haute', nodeType: 'prompt', promptText: 'Réalise une analyse approfondie sur la base du brief. Identifie les enjeux, risques et opportunités.', agentOwner: '' } },
      { id: 'n3', type: 'promptNode', position: { x: 590, y: 150 }, data: { label: 'Rapport', criticite: 'normale', nodeType: 'prompt', promptText: 'Synthétise l\'analyse en un rapport exécutif clair avec conclusions et recommandations actionnables.', agentOwner: '' } },
    ]),
    edges: JSON.stringify([
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true },
      { id: 'e2-3', source: 'n2', target: 'n3', animated: true },
    ]),
  },
  {
    id: 'sys-onboarding-client',
    userId: null,
    nom: 'Onboarding Client',
    description: 'Accueil, configuration parallèle et formation, puis suivi post-onboarding.',
    icon: '🤝',
    categorie: 'Commercial',
    isPublic: true,
    nodes: JSON.stringify([
      { id: 'n1', type: 'promptNode', position: { x: 50,  y: 200 }, data: { label: 'Accueil',      criticite: 'haute',    nodeType: 'prompt', promptText: 'Prépare le message d\'accueil personnalisé et le kit de bienvenue pour le nouveau client.', agentOwner: '' } },
      { id: 'n2', type: 'agentNode',  position: { x: 320, y: 80  }, data: { label: 'Configuration', criticite: 'haute',    nodeType: 'agent',  promptText: '', agentOwner: 'Agent Tech Lead' } },
      { id: 'n3', type: 'agentNode',  position: { x: 320, y: 320 }, data: { label: 'Formation',     criticite: 'normale',  nodeType: 'agent',  promptText: '', agentOwner: 'Agent RH' } },
      { id: 'n4', type: 'promptNode', position: { x: 590, y: 200 }, data: { label: 'Suivi J+30',    criticite: 'normale',  nodeType: 'prompt', promptText: 'Rédige le compte-rendu de suivi J+30 : satisfaction client, points bloquants, actions correctives.', agentOwner: '' } },
    ]),
    edges: JSON.stringify([
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true },
    ]),
  },
  {
    id: 'sys-code-review',
    userId: null,
    nom: 'Code Review Pipeline',
    description: 'Lecture du code, analyse qualité et sécurité en parallèle, rapport de review final.',
    icon: '🔍',
    categorie: 'Technique',
    isPublic: true,
    nodes: JSON.stringify([
      { id: 'n1', type: 'promptNode', position: { x: 50,  y: 200 }, data: { label: 'Lecture code',    criticite: 'normale', nodeType: 'prompt', promptText: 'Lis et comprends le code soumis. Résume son fonctionnement, ses responsabilités et son périmètre.', agentOwner: '' } },
      { id: 'n2', type: 'agentNode',  position: { x: 320, y: 80  }, data: { label: 'Qualité code',    criticite: 'haute',   nodeType: 'agent',  promptText: '', agentOwner: 'Agent Tech Lead' } },
      { id: 'n3', type: 'agentNode',  position: { x: 320, y: 320 }, data: { label: 'Analyse sécurité', criticite: 'haute',  nodeType: 'agent',  promptText: '', agentOwner: 'Agent Juridique' } },
      { id: 'n4', type: 'promptNode', position: { x: 590, y: 200 }, data: { label: 'Rapport review',  criticite: 'haute',   nodeType: 'prompt', promptText: 'Consolide les analyses qualité et sécurité en un rapport de review structuré avec priorités et corrections suggérées.', agentOwner: '' } },
    ]),
    edges: JSON.stringify([
      { id: 'e1-2', source: 'n1', target: 'n2', animated: true },
      { id: 'e1-3', source: 'n1', target: 'n3', animated: true },
      { id: 'e2-4', source: 'n2', target: 'n4', animated: true },
      { id: 'e3-4', source: 'n3', target: 'n4', animated: true },
    ]),
  },
]

// GET /pipeline-templates — hardcoded + user DB templates
app.get('/pipeline-templates', async (c) => {
  const user = c.get('user')
  const userTemplates = await db.select().from(pipelineTemplates)
    .where(or(eq(pipelineTemplates.userId, user.sub), isNull(pipelineTemplates.userId)))
    .orderBy(desc(pipelineTemplates.createdAt))
  return c.json([...PIPELINE_TEMPLATES, ...userTemplates])
})

// POST /pipeline-templates — save user template
app.post('/pipeline-templates', zValidator('json', z.object({
  nom:         z.string().min(1).max(200),
  description: z.string().optional(),
  icon:        z.string().optional(),
  categorie:   z.string().optional(),
  nodes:       z.string(),
  edges:       z.string(),
})), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const [tpl] = await db.insert(pipelineTemplates).values({
    userId:      user.sub,
    nom:         body.nom,
    description: body.description ?? '',
    icon:        body.icon ?? '🔄',
    categorie:   body.categorie ?? '',
    nodes:       body.nodes,
    edges:       body.edges,
    isPublic:    false,
  }).returning()
  return c.json(tpl, 201)
})

// DELETE /pipeline-templates/:id
app.delete('/pipeline-templates/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(pipelineTemplates)
    .where(and(eq(pipelineTemplates.id, id), eq(pipelineTemplates.userId, user.sub)))
  return c.json({ ok: true })
})

// POST /poles/:poleId/dag/import — bulk create nodes from template
app.post('/poles/:poleId/dag/import', zValidator('json', z.object({
  nodes:         z.array(z.any()),
  edges:         z.array(z.any()),
  clearExisting: z.boolean().optional(),
})), async (c) => {
  const { poleId } = c.req.param()
  const user = c.get('user')
  const { nodes, edges, clearExisting } = c.req.valid('json')

  if (clearExisting) {
    await db.delete(taskDagItems)
      .where(and(eq(taskDagItems.poleId, poleId), eq(taskDagItems.userId, user.sub)))
  }

  // Map old template IDs → new DB IDs
  const idMap: Record<string, string> = {}
  const created: any[] = []

  for (const node of nodes) {
    const [item] = await db.insert(taskDagItems).values({
      poleId,
      userId:     user.sub,
      nom:        node.data?.label ?? 'Tâche',
      description: node.data?.description ?? '',
      agentOwner: node.data?.agentOwner ?? '',
      dependances: '[]',
      criticite:  node.data?.criticite ?? 'normale',
      nodeType:   node.data?.nodeType ?? 'prompt',
      posX:       node.position?.x ?? 0,
      posY:       node.position?.y ?? 0,
      promptText: node.data?.promptText ?? '',
    }).returning()
    idMap[node.id] = item.id
    created.push(item)
  }

  // Apply dependances from edges (target depends on source)
  const depsMap: Record<string, string[]> = {}
  for (const edge of edges) {
    const targetId = idMap[edge.target]
    const sourceId = idMap[edge.source]
    if (targetId && sourceId) {
      if (!depsMap[targetId]) depsMap[targetId] = []
      depsMap[targetId].push(sourceId)
    }
  }

  for (const [dbId, deps] of Object.entries(depsMap)) {
    await db.update(taskDagItems)
      .set({ dependances: JSON.stringify(deps), updatedAt: new Date() })
      .where(eq(taskDagItems.id, dbId))
  }

  return c.json({ ok: true, created: created.length })
})

// POST /pipeline-assistant/chat — streaming LLM pour concevoir un pipeline
const ASSISTANT_SYSTEM = `Tu es un expert en orchestration de workflows et de pipelines d'agents IA.
Tu aides l'utilisateur à concevoir, discuter et générer des pipelines DAG (graphes acycliques dirigés).

Chaque pipeline est composé de :
- Nœuds de type "prompt" : exécutent un prompt LLM libre
- Nœuds de type "agent" : délèguent à un agent Forge spécialisé
- Arêtes : transmettent l'output d'un nœud vers le suivant

Quand l'utilisateur te demande de GÉNÉRER un pipeline, produis un JSON valide dans ce format exact :
\`\`\`json
{
  "nodes": [
    { "id": "n1", "type": "promptNode", "position": { "x": 50, "y": 150 }, "data": { "label": "Nom du nœud", "criticite": "normale", "nodeType": "prompt", "promptText": "Instructions pour ce nœud", "agentOwner": "" } }
  ],
  "edges": [
    { "id": "e1-2", "source": "n1", "target": "n2", "animated": true }
  ]
}
\`\`\`

Types de criticité disponibles : faible, normale, haute, critique
Types de nœuds : promptNode (prompt libre) ou agentNode (agent Forge, remplis agentOwner avec le nom de l'agent)

Si l'utilisateur veut DISCUTER ou avoir des conseils, réponds naturellement sans JSON.
Réponds toujours dans la langue de l'utilisateur.`

app.post('/pipeline-assistant/chat', zValidator('json', z.object({
  messages:  z.array(z.object({ role: z.string(), content: z.string() })),
  provider:  z.string().optional(),
  model:     z.string().optional(),
})), async (c) => {
  const { messages, provider, model } = c.req.valid('json')
  const llmModel = getModel(provider, model) as any
  const result = streamText({
    model: llmModel,
    system: ASSISTANT_SYSTEM,
    messages: messages as any,
  })
  return result.toDataStreamResponse()
})

export default app
