import { generateText, tool } from 'ai'
import { z } from 'zod'
import { getModel } from '@/llm'
import { getContext } from '@/memory/retriever'
import { metrics } from '@/metrics'

export interface ReactStep {
  type: 'thought' | 'tool_call' | 'tool_result' | 'answer'
  content: string
  toolName?: string
}

export interface ReactResult {
  steps: ReactStep[]
  answer: string
  tokensIn: number
  tokensOut: number
}

export async function runReact(
  input: string,
  sessionId: string,
  provider?: string,
  model?: string,
  extraTools?: Record<string, ReturnType<typeof tool>>,
  skillsContext?: string,
  onStep?: (step: ReactStep) => void,
): Promise<ReactResult> {
  const steps: ReactStep[] = []
  const ragContext = await getContext(input, sessionId)

  const push = (step: ReactStep) => {
    steps.push(step)
    onStep?.(step)
  }

  const tools = {
    query_knowledge_base: tool({
      description: 'Search the knowledge base (RAG) for context from this project.',
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const ctx = await getContext(query, sessionId)
        metrics.react_tool_calls++
        return ctx || 'Nothing found.'
      },
    }),
    search_web: tool({
      description: 'Search the web for current information, news, or facts.',
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        metrics.react_tool_calls++
        const braveKey = process.env.BRAVE_SEARCH_API_KEY
        if (!braveKey) return 'Web search unavailable (BRAVE_SEARCH_API_KEY not set).'
        try {
          const res = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`,
            { headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' } },
          )
          if (!res.ok) return 'Web search failed.'
          const data = await res.json() as any
          return data.web?.results?.slice(0, 3)
            .map((r: any) => `**${r.title}**: ${r.description}`)
            .join('\n') || 'No results.'
        } catch {
          return 'Web search error.'
        }
      },
    }),
    calculate: tool({
      description: 'Evaluate a mathematical expression.',
      parameters: z.object({ expression: z.string() }),
      execute: async ({ expression }) => {
        metrics.react_tool_calls++
        try {
          const safe = expression.replace(/[^0-9+\-*/().%, ]/g, '')
          // eslint-disable-next-line no-new-func
          return String(new Function(`"use strict"; return (${safe})`)())
        } catch {
          return 'Calculation error.'
        }
      },
    }),
    ...(extraTools || {}),
  }

  const systemPrompt = `You are Forge, an expert AI assistant operating in ReAct mode (Reason + Act).
Think carefully, use tools when you need external information, then give a final answer.
${skillsContext ? `\n## Active Skills\n${skillsContext}\n` : ''}
${ragContext ? `\n## Project Context\n${ragContext}\n` : ''}
Always respond in the same language as the user.`

  const result = await generateText({
    model: getModel(provider, model) as any,
    system: systemPrompt,
    prompt: input,
    tools,
    maxSteps: 8,
    onStepFinish: (step) => {
      if (step.text) push({ type: 'thought', content: step.text })
      for (const tc of step.toolCalls ?? []) {
        push({
          type: 'tool_call',
          toolName: tc.toolName,
          content: JSON.stringify((tc as any).args ?? (tc as any).input ?? {}),
        })
      }
      for (const tr of step.toolResults ?? []) {
        push({
          type: 'tool_result',
          toolName: tr.toolName,
          content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
        })
      }
    },
  })

  push({ type: 'answer', content: result.text })

  metrics.react_runs_total++
  metrics.llm_tokens_in  += result.usage?.promptTokens    ?? 0
  metrics.llm_tokens_out += result.usage?.completionTokens ?? 0

  return {
    steps,
    answer: result.text,
    tokensIn:  result.usage?.promptTokens    ?? 0,
    tokensOut: result.usage?.completionTokens ?? 0,
  }
}
