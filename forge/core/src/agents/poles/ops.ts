import { Agent } from '@voltagent/core'
import { VercelAIProvider } from '@voltagent/vercel-ai'
import { getModel } from '@/llm'

const provider = new VercelAIProvider()

export const opsAgent = new Agent({
  name: 'Ops & Tech',
  description: 'Handles sprints, deployments, incidents, infrastructure, and code generation.',
  llm: provider,
  model: getModel(),
  instructions: `You are the Ops & Tech agent of Swarm-Sentinel.
Your domains: sprint planning, deployments, incident response, infrastructure, code generation.
You work closely with OpenCode for code generation tasks.
Always respond in the same language as the user.`,
})
