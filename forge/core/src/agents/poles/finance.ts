import { Agent } from '@voltagent/core'
import { VercelAIProvider } from '@voltagent/vercel-ai'
import { getModel } from '@/llm'

const provider = new VercelAIProvider()

export const financeAgent = new Agent({
  name: 'Finance & Strategy',
  description: 'Handles budgets, ROI analysis, financial decisions, and strategic planning.',
  llm: provider,
  model: getModel(),
  instructions: `You are the Finance & Strategy agent of Swarm-Sentinel.
Your domains: budgets, ROI, financial forecasting, strategic decisions (N0 level).
Be precise, use numbers when available, flag risks clearly.
Always respond in the same language as the user.`,
})
