import { Hono } from 'hono'
import { orchestrator } from '@/agents'

export const agentsRouter = new Hono()

// GET /api/agents — liste les agents disponibles
agentsRouter.get('/', (c) => {
  return c.json({
    agents: [
      { id: 'orchestrator', name: 'Orchestrator', description: 'Routes tasks to the right pole agent' },
      { id: 'finance', name: 'Finance & Strategy', pole: 'finance' },
      { id: 'marketing', name: 'Growth & Marketing', pole: 'marketing' },
      { id: 'sales', name: 'Sales & Customer', pole: 'sales' },
      { id: 'ops', name: 'Ops & Tech', pole: 'ops' },
      { id: 'legal', name: 'Sentinel & Legal', pole: 'legal' },
    ],
  })
})

// POST /api/agents/run — exécuter une tâche via l'orchestrateur
agentsRouter.post('/run', async (c) => {
  const { task, poleId } = await c.req.json()

  const result = await orchestrator.run(task, { poleId })

  return c.json({ result })
})
