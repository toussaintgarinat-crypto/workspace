import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'
import { streamText } from 'ai'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { getModel, resolveLlmConfig } from '@/llm'
import { getContext } from '@/memory/retriever'
import { db } from '@/db'
import { messages, sessions, users, organizations, skills as skillsTable, poles, ventures, agentDefinitions, forgePersonalities } from '@/db/schema'
import { eq, and, or } from 'drizzle-orm'
import { runReact } from '@/agents/react-executor'
import { buildSkillsContext, matchesSkillTriggers } from '@/skills/executor'
import { metrics } from '@/metrics'

const KEYCLOAK_URL   = process.env.KEYCLOAK_URL   || 'http://localhost:8080'
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'forge'
const JWKS_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`
const ISSUERS = [
  `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
  `http://localhost:8080/realms/${KEYCLOAK_REALM}`,
  `http://127.0.0.1:8080/realms/${KEYCLOAK_REALM}`,
]
const JWKS = createRemoteJWKSet(new URL(JWKS_URL))

export const wsRouter = new Hono()

// WS /api/ws/:sessionId?token=<jwt>
wsRouter.get(
  '/:sessionId',
  upgradeWebSocket(async (c) => {
    const { sessionId } = c.req.param()
    const tokenParam = c.req.query('token')

    let userId: string | null = null
    try {
      const { payload } = await jwtVerify(tokenParam || '', JWKS, { issuer: ISSUERS })
      const keycloakSub = payload.sub as string

      let [user] = await db.select({ id: users.id }).from(users).where(eq(users.keycloakSub, keycloakSub))

      if (!user) {
        const nom         = (payload['nom'] as string) || (payload['preferred_username'] as string) || (payload['name'] as string) || 'Utilisateur'
        const email       = (payload['email'] as string) || `${keycloakSub}@forge.local`
        const avatarEmoji = (payload['avatarEmoji'] as string) || '👤'

        const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
        if (byEmail) {
          ;[user] = await db.update(users).set({ keycloakSub }).where(eq(users.id, byEmail.id)).returning({ id: users.id })
        } else {
          ;[user] = await db.insert(users).values({ email, nom, avatarEmoji, keycloakSub }).returning({ id: users.id })
        }

        // Auto-create personal org on first login
        const existingOrgs = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.ownerId, user.id))
        if (!existingOrgs.length) {
          const slug = `${email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`
          await db.insert(organizations).values({ nom, slug, plan: 'personal', ownerId: user.id })
        }
      }

      if (user) userId = user.id
    } catch {}

    return {
      async onOpen(_, ws) {
        if (!userId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }))
          ws.close()
          return
        }
        metrics.ws_connections++
        ws.send(JSON.stringify({ type: 'connected', sessionId }))
      },

      async onMessage(event, ws) {
        if (!userId) return
        metrics.ws_messages_total++

        let payload: {
          content: string
          provider?: string
          model?: string
          reactMode?: boolean
          agentId?: string
        }
        try {
          payload = JSON.parse(event.data.toString())
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
          return
        }

        const { content, provider, model, reactMode, agentId } = payload
        if (!content?.trim()) return

        await db.insert(messages).values({ sessionId, role: 'user', content })
        ws.send(JSON.stringify({ type: 'thinking' }))
        metrics.llm_requests_total++

        // Load active skills
        const activeSkills = await db.select().from(skillsTable).where(
          and(
            or(eq(skillsTable.userId, userId!), eq(skillsTable.global, true)),
            eq(skillsTable.actif, true),
          ),
        )
        const matchedSkills = matchesSkillTriggers(content, activeSkills)
        const skillsContext  = buildSkillsContext(matchedSkills)
        if (matchedSkills.length) metrics.skills_activations++

        // Résoudre le modèle LLM depuis la config du pôle si applicable
        const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
        let resolvedProvider = provider
        let resolvedModel    = model
        let poleContext: { nom: string; type: string } | null = null
        let ventureContext: { nom: string } | null = null
        let agentPersonality: string | null = null

        if (agentId) {
          const [agentRow] = await db.select({
            personalityId: agentDefinitions.personalityId,
            instructions:  agentDefinitions.instructions,
          }).from(agentDefinitions).where(eq(agentDefinitions.id, agentId))

          if (agentRow?.personalityId) {
            const [perso] = await db.select({ systemPrompt: forgePersonalities.systemPrompt })
              .from(forgePersonalities).where(eq(forgePersonalities.id, agentRow.personalityId))
            if (perso?.systemPrompt) agentPersonality = perso.systemPrompt
          }
          if (!agentPersonality && agentRow?.instructions) {
            agentPersonality = agentRow.instructions
          }
        }

        if (session?.poleId) {
          const [poleRow] = await db.select().from(poles).where(eq(poles.id, session.poleId))
          if (poleRow) poleContext = { nom: poleRow.nom, type: poleRow.type ?? 'custom' }

          if (!resolvedProvider || !resolvedModel) {
            const preset = await resolveLlmConfig({ poleId: session.poleId, ventureId: session.ventureId ?? undefined, orgId: session.orgId ?? undefined })
            if (preset?.provider) resolvedProvider = preset.provider
            if (preset?.model)    resolvedModel    = preset.model
          }
        }

        if (session?.ventureId && !poleContext) {
          const [ventureRow] = await db.select().from(ventures).where(eq(ventures.id, session.ventureId))
          if (ventureRow) ventureContext = { nom: ventureRow.nom }
        }

        if (reactMode) {
          try {
            const result = await runReact(
              content, sessionId, userId!, resolvedProvider, resolvedModel, undefined, skillsContext,
              (step) => ws.send(JSON.stringify({ type: 'react_step', step })),
              agentPersonality ?? undefined,
            )
            await db.insert(messages).values({ sessionId, role: 'assistant', content: result.answer })
            await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId))
            ws.send(JSON.stringify({ type: 'done', content: result.answer, steps: result.steps }))
          } catch {
            metrics.errors_total++
            ws.send(JSON.stringify({ type: 'error', message: 'ReAct error' }))
          }
          return
        }

        // Standard streaming mode
        const context = await getContext(content, sessionId)
        const systemPrompt = buildSystemPrompt(context, skillsContext, poleContext, ventureContext, agentPersonality)

        try {
          const llmModel = getModel(resolvedProvider, resolvedModel) as any
          const result   = streamText({
            model: llmModel,
            system: systemPrompt,
            messages: [{ role: 'user', content }],
          })

          let fullText = ''
          for await (const chunk of (await result).textStream) {
            fullText += chunk
            ws.send(JSON.stringify({ type: 'chunk', content: chunk }))
          }

          await db.insert(messages).values({ sessionId, role: 'assistant', content: fullText })
          await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId))
          ws.send(JSON.stringify({ type: 'done', content: fullText }))
        } catch {
          metrics.errors_total++
          ws.send(JSON.stringify({ type: 'error', message: 'LLM error' }))
        }
      },

      onClose() { metrics.ws_connections = Math.max(0, metrics.ws_connections - 1) },
      onError(_, ws) { ws.close() },
    }
  })
)

function buildSystemPrompt(
  ragContext: string,
  skillsContext: string,
  poleContext?: { nom: string; type: string } | null,
  ventureContext?: { nom: string } | null,
  agentPersonality?: string | null,
): string {
  const parts: string[] = []

  if (agentPersonality) {
    parts.push(agentPersonality)
    if (poleContext)   parts.push(`You are operating within the "${poleContext.nom}" pole.`)
    if (ventureContext) parts.push(`Context: venture "${ventureContext.nom}".`)
  } else if (poleContext) {
    parts.push(`You are Forge, an expert AI assistant operating within the "${poleContext.nom}" pole.`)
  } else if (ventureContext) {
    parts.push(`You are Forge, an expert AI assistant operating within the venture "${ventureContext.nom}".`)
  } else {
    parts.push('You are Forge, an expert AI assistant for the Swarm-Sentinel platform.')
  }

  parts.push('Be concise, technical, and precise. Respond in the same language as the user.')
  if (skillsContext) parts.push(`\n## Active Skills\n${skillsContext}`)
  if (ragContext)    parts.push(`\n## Project Context\n${ragContext}\nBase your answers on the context when relevant.`)
  return parts.join('\n')
}
