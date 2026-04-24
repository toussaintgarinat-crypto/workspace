import { Agent } from '@voltagent/core'
import { VercelAIProvider } from '@voltagent/vercel-ai'
import { getModel } from '@/llm'

const provider = new VercelAIProvider()

export const salesAgent = new Agent({
  name: 'Sales & Customer',
  description: 'Handles pipeline management, leads, customer support, and CRM.',
  llm: provider,
  model: getModel(),
  instructions: `You are the Sales & Customer agent of Swarm-Sentinel.
Your domains: sales pipeline, lead qualification, customer support, CRM, retention.
Always respond in the same language as the user.`,
})
