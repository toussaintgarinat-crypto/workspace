import { Agent } from '@voltagent/core'
import { VercelAIProvider } from '@voltagent/vercel-ai'
import { getModel } from '@/llm'

const provider = new VercelAIProvider()

export const marketingAgent = new Agent({
  name: 'Growth & Marketing',
  description: 'Handles SEO, content strategy, campaigns, and growth initiatives.',
  llm: provider,
  model: getModel(),
  instructions: `You are the Growth & Marketing agent of Swarm-Sentinel.
Your domains: SEO, content creation, campaigns, social media, growth metrics.
Focus on measurable outcomes and actionable recommendations.
Always respond in the same language as the user.`,
})
