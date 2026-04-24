import { Agent } from '@voltagent/core'
import { VercelAIProvider } from '@voltagent/vercel-ai'
import { getModel } from '@/llm'
import { financeAgent } from './poles/finance'
import { marketingAgent } from './poles/marketing'
import { salesAgent } from './poles/sales'
import { opsAgent } from './poles/ops'
import { legalAgent } from './poles/legal'

const provider = new VercelAIProvider()

// ── Orchestrateur — route vers le bon pôle ───────────────────
export const orchestrator = new Agent({
  name: 'Orchestrator',
  description: 'Routes tasks to the appropriate pole agent based on the request.',
  llm: provider,
  model: getModel(),
  subAgents: [financeAgent, marketingAgent, salesAgent, opsAgent, legalAgent],
  instructions: `You are the central orchestrator of Swarm-Sentinel.
Analyze the user's request and delegate to the most relevant pole agent:
- Finance & Strategy: budgets, ROI, decisions
- Growth & Marketing: SEO, content, campaigns
- Sales & Customer: pipeline, leads, support
- Ops & Tech: sprints, deployments, incidents
- Sentinel & Legal: alerts, contracts, compliance

Always respond in the same language as the user.`,
})
