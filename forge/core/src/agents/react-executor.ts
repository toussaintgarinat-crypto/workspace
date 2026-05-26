import { generateText, tool, jsonSchema } from 'ai'
import { z } from 'zod'
import { getModel } from '@/llm'
import { getContext } from '@/memory/retriever'
import { metrics } from '@/metrics'
import { db } from '@/db'
import { mcpServers, governorUsage } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { computeCost } from '@/pricing'
import { listMCPTools, callMCPTool, type MCPServerConfig } from '@/mcp/client'

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

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

async function buildMcpTools(userId: string): Promise<Record<string, any>> {
  const servers = await db.select().from(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.actif, true)))

  const result: Record<string, any> = {}

  await Promise.all(servers.map(async (server) => {
    try {
      const mcpToolList = await listMCPTools(server as MCPServerConfig)
      const prefix = `mcp__${slugify(server.nom)}`
      for (const t of mcpToolList) {
        result[`${prefix}__${t.name}`] = tool({
          description: `[MCP:${server.nom}] ${t.description}`,
          parameters: jsonSchema(t.inputSchema as any),
          execute: async (args) => {
            metrics.mcp_calls_total++
            return callMCPTool(server as MCPServerConfig, t.name, args as Record<string, unknown>)
          },
        })
      }
    } catch {
      // server unreachable, skip
    }
  }))

  return result
}

export async function runReact(
  input: string,
  sessionId: string,
  userId: string,
  provider?: string,
  model?: string,
  extraTools?: Record<string, ReturnType<typeof tool>>,
  skillsContext?: string,
  onStep?: (step: ReactStep) => void,
  personalityPrompt?: string,
): Promise<ReactResult> {
  const steps: ReactStep[] = []
  const [ragContext, mcpTools] = await Promise.all([
    getContext(input, sessionId),
    buildMcpTools(userId),
  ])

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
    calendar_get_planning: tool({
      description: 'Get calendar events for a date range. Use to check schedule, upcoming appointments, or plan around existing events.',
      parameters: z.object({
        calendar_id: z.string().describe('Calendar ID to query'),
        start_date: z.string().describe('ISO 8601 start date, e.g. 2026-05-25'),
        end_date: z.string().describe('ISO 8601 end date, e.g. 2026-05-31'),
      }),
      execute: async ({ calendar_id, start_date, end_date }) => {
        metrics.react_tool_calls++
        const calendarUrl = process.env.CALENDAR_URL
        const calendarToken = process.env.CALENDAR_SERVICE_TOKEN
        if (!calendarUrl) return 'Calendar service unavailable (CALENDAR_URL not set).'
        try {
          const params = new URLSearchParams({ start: start_date, end: end_date })
          const headers: Record<string, string> = {}
          if (calendarToken) headers['Authorization'] = `Bearer ${calendarToken}`
          if (userId) headers['X-User-Id'] = userId
          const res = await fetch(
            `${calendarUrl.replace(/\/$/, '')}/calendars/${calendar_id}/events?${params}`,
            { headers },
          )
          if (!res.ok) return `Calendar error ${res.status}.`
          const events = await res.json() as Array<{ title: string; start_at: string; end_at: string; description?: string }>
          if (!events.length) return 'No events in this period.'
          return events.map(e => `• ${e.title} (${e.start_at} → ${e.end_at})`).join('\n')
        } catch (err) {
          return `Calendar fetch failed: ${String(err).slice(0, 100)}`
        }
      },
    }),
    ...mcpTools,
    ...(extraTools || {}),
  }

  const baseIdentity = personalityPrompt
    ? personalityPrompt
    : 'You are Forge, an expert AI assistant operating in ReAct mode (Reason + Act).'
  const systemPrompt = `${baseIdentity}
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

  // Governor — fire-and-forget, non-blocking
  const _provider = provider ?? process.env.DEFAULT_LLM_PROVIDER ?? 'ollama'
  const _model    = model    ?? process.env.DEFAULT_LLM_MODEL    ?? 'unknown'
  const _tIn  = result.usage?.promptTokens    ?? 0
  const _tOut = result.usage?.completionTokens ?? 0
  db.insert(governorUsage).values({
    userId,
    provider: _provider,
    model:    _model,
    tokensIn:  _tIn,
    tokensOut: _tOut,
    coutUsd:   computeCost(_provider, _model, _tIn, _tOut),
  }).catch(() => {})

  return {
    steps,
    answer: result.text,
    tokensIn:  result.usage?.promptTokens    ?? 0,
    tokensOut: result.usage?.completionTokens ?? 0,
  }
}
