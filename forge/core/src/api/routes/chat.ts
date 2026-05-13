import { Hono } from 'hono'
import { streamText } from 'ai'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getModel, resolveLlmConfig } from '@/llm'
import { getContext } from '@/memory/retriever'
import { db } from '@/db'
import { messages, sessions, poles, ventures } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const chatRouter = new Hono()

const messageSchema = z.object({
  sessionId: z.string(),
  content:   z.string(),
  provider:  z.string().optional(),
  model:     z.string().optional(),
})

async function resolveSessionContext(sessionId: string, provider?: string, model?: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
  let resolvedProvider = provider
  let resolvedModel    = model
  let poleContext: { nom: string; type: string } | null = null
  let ventureContext: { nom: string } | null = null

  if (session?.poleId) {
    const [poleRow] = await db.select().from(poles).where(eq(poles.id, session.poleId))
    if (poleRow) poleContext = { nom: poleRow.nom, type: poleRow.type ?? 'custom' }

    if (!resolvedProvider || !resolvedModel) {
      const preset = await resolveLlmConfig({ poleId: session.poleId, ventureId: session.ventureId ?? undefined })
      if (preset?.provider) resolvedProvider = preset.provider
      if (preset?.model)    resolvedModel    = preset.model
    }
  }

  if (session?.ventureId && !poleContext) {
    const [ventureRow] = await db.select().from(ventures).where(eq(ventures.id, session.ventureId))
    if (ventureRow) ventureContext = { nom: ventureRow.nom }
  }

  return { resolvedProvider, resolvedModel, poleContext, ventureContext }
}

const POLE_PERSONAS: Record<string, string> = {
  finance:   'You are the Finance AI of Forge. You specialize in budgets, forecasts, invoices, cash flow, OKRs, and financial reporting.',
  marketing: 'You are the Marketing AI of Forge. You specialize in campaigns, content, growth metrics, SEO, and brand strategy.',
  sales:     'You are the Sales AI of Forge. You specialize in CRM, lead qualification, pipeline management, and deal closing.',
  ops:       'You are the Operations AI of Forge. You specialize in project management, sprints, tasks, incidents, and process optimization.',
  legal:     'You are the Legal AI of Forge. You specialize in contracts, compliance, audit missions, and regulatory matters.',
  dev:       'You are the Dev AI of Forge. You specialize in code, architecture, CI/CD, and technical implementations.',
  custom:    'You are a specialized AI of Forge.',
}

function buildSystemPrompt(
  context: string,
  poleContext?: { nom: string; type: string } | null,
  ventureContext?: { nom: string } | null,
): string {
  const parts: string[] = []

  if (poleContext) {
    const persona = POLE_PERSONAS[poleContext.type] ?? POLE_PERSONAS.custom
    parts.push(`${persona}\nYou are operating within the "${poleContext.nom}" pole.`)
  } else if (ventureContext) {
    parts.push(`You are Forge, an expert AI assistant operating within the venture "${ventureContext.nom}".`)
  } else {
    parts.push('You are Forge, an expert AI assistant for the Swarm-Sentinel platform.')
  }

  parts.push('Be concise, technical, and precise. Respond in the same language as the user.')
  if (context) parts.push(`\n## Project Context\n${context}\nBase your answers on the context when relevant.`)
  return parts.join('\n')
}

// POST /api/chat — message standard (non-streaming)
chatRouter.post(
  '/',
  zValidator('json', messageSchema),
  async (c) => {
    const { sessionId, content, provider, model } = c.req.valid('json')

    const context = await getContext(content, sessionId)
    const { resolvedProvider, resolvedModel, poleContext, ventureContext } =
      await resolveSessionContext(sessionId, provider, model)

    await db.insert(messages).values({ sessionId, role: 'user', content })

    const llmModel = getModel(resolvedProvider, resolvedModel) as any
    const result = streamText({
      model: llmModel,
      system: buildSystemPrompt(context, poleContext, ventureContext),
      messages: [{ role: 'user', content }],
    })

    let response = ''
    for await (const chunk of result.textStream) {
      response += chunk
    }

    await db.insert(messages).values({ sessionId, role: 'assistant', content: response })
    await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId))

    return c.json({ content: response })
  }
)

// POST /api/chat/stream — streaming SSE
chatRouter.post(
  '/stream',
  zValidator('json', messageSchema),
  async (c) => {
    const { sessionId, content, provider, model } = c.req.valid('json')

    const context = await getContext(content, sessionId)
    const { resolvedProvider, resolvedModel, poleContext, ventureContext } =
      await resolveSessionContext(sessionId, provider, model)

    await db.insert(messages).values({ sessionId, role: 'user', content })

    const llmModel = getModel(resolvedProvider, resolvedModel) as any

    const result = streamText({
      model: llmModel,
      system: buildSystemPrompt(context, poleContext, ventureContext),
      messages: [{ role: 'user', content }],
      onFinish: async ({ text }) => {
        await db.insert(messages).values({ sessionId, role: 'assistant', content: text })
        await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId))
      },
    })

    return result.toDataStreamResponse()
  }
)
