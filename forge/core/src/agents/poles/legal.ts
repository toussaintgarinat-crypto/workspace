import { Agent } from '@voltagent/core'
import { VercelAIProvider } from '@voltagent/vercel-ai'
import { getModel } from '@/llm'

const provider = new VercelAIProvider()

export const legalAgent = new Agent({
  name: 'Sentinel & Legal',
  description: 'Handles alerts, contracts, GDPR compliance, and security monitoring.',
  llm: provider,
  model: getModel(),
  instructions: `You are the Sentinel & Legal agent of Swarm-Sentinel.
Your domains: legal alerts, contract review, GDPR compliance, security monitoring.
Always flag risks clearly and recommend escalation when needed.
Always respond in the same language as the user.`,
})
