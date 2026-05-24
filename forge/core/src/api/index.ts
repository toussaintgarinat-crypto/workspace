import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { healthRouter } from '@/api/routes/health'
import { authRouter } from '@/api/routes/auth'
import { sessionsRouter } from '@/api/routes/sessions'
import { chatRouter } from '@/api/routes/chat'
import { agentsRouter } from '@/api/routes/agents'
import { polesRouter } from '@/api/routes/poles'
import { llmConfigRouter } from '@/api/routes/llm-config'
import { wsRouter } from '@/api/routes/ws'
import { commandBridgeRouter } from '@/api/routes/command-bridge'
import { authMiddleware } from '@/api/middleware/auth'
import sprintsRouter from '@/api/routes/sprints'
import budgetRouter from '@/api/routes/budget'
import crmRouter from '@/api/routes/crm'
import auditRouter from '@/api/routes/audit'
import documentsRouter from '@/api/routes/documents'
import contratsRouter from '@/api/routes/contrats'
import incidentsRouter from '@/api/routes/incidents'
import socialRouter from '@/api/routes/social'
import gitpackRouter from '@/api/routes/gitpack'
import briefRouter from '@/api/routes/brief'
import okrRouter from '@/api/routes/okr'
import facturationRouter from '@/api/routes/facturation'
import kbRouter from '@/api/routes/kb'
import veilleRouter from '@/api/routes/veille'
import agentFactoryRouter from '@/api/routes/agents-factory'
import webhooksRouter from '@/api/routes/webhooks'
import netbirdRouter from '@/api/routes/netbird'
import { apiKeysRouter } from '@/api/routes/api-keys'
import { orgsRouter } from '@/api/routes/organizations'
import { voiceRouter } from '@/api/routes/voice'
import { voiceRealtimeRouter } from '@/api/routes/voice-realtime'
import governorRouter from '@/api/routes/governor'
import riskEngineRouter from '@/api/routes/risk-engine'
import injectionGuardRouter from '@/api/routes/injection-guard'
import agentAutonomyRouter from '@/api/routes/agent-autonomy'
import sloRouter from '@/api/routes/slo'
import degradationRouter from '@/api/routes/degradation'
import memoryPalaceRouter from '@/api/routes/memory-palace'
import taskDagRouter from '@/api/routes/task-dag'
import orchestratorRouter from '@/api/routes/orchestrator'
import automationRouter from '@/api/routes/automation'
import morningBriefRouter from '@/api/routes/morning-brief'
import forecastRouter from '@/api/routes/forecast'
import venturesRouter from '@/api/routes/ventures'
import templatesRouter from '@/api/routes/templates'
import devTeamRouter from '@/api/routes/dev-team'
import analyticsRouter from '@/api/routes/analytics'
import searchRouter from '@/api/routes/search'
import teamRouter from '@/api/routes/team'
import imapRouter from '@/api/routes/imap'
import calendarRouter from '@/api/routes/calendar'
import pushRouter from '@/api/routes/push'
import stripeRouter from '@/api/routes/stripe'
import rapportRouter from '@/api/routes/rapport'
import seoAgentRouter from '@/api/routes/seo-agent'
import contentAgentRouter from '@/api/routes/content-agent'
import prospectionRouter from '@/api/routes/prospection'
import legalAgentRouter from '@/api/routes/legal-agent'
import sentinelRgpdRouter from '@/api/routes/sentinel-rgpd'
import keybindingsRouter from '@/api/routes/keybindings'
import savedFiltersRouter from '@/api/routes/saved-filters'
import stagingRouter from '@/api/routes/staging'
import auditLogsRouter from '@/api/routes/audit-logs'
import poleDevBridgeRouter from '@/api/routes/pole-dev-bridge'
import mcpRouter from '@/api/routes/mcp'
import skillsRouter from '@/api/routes/skills'
import hitlRouter from '@/api/routes/hitl'
import repetitionRouter from '@/api/routes/repetition'
import metricsRouter from '@/api/routes/metrics'
import { conseilRouter } from '@/api/routes/conseil'
import pipelineTemplatesRouter from '@/api/routes/pipeline-templates'
import deployRouter from '@/api/routes/deploy'
import serversRouter from '@/api/routes/servers'

export const app = new Hono()

// ── Middleware global ────────────────────────────────────────
app.use('*', logger())
app.use('*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  allowHeaders: ['Content-Type', 'Authorization', 'X-Org-ID'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

// ── S99 — Headers de deprecation pour les alias /api/* ─────────────────
// Les clients qui appellent /api/... (legacy) recoivent les headers RFC 8594.
// Les clients qui appellent /v1/api/... (canonique) n'en recoivent pas.
// Sunset ~ 6 mois apres livraison S99.
const DEPRECATION_SUNSET = 'Mon, 23 Nov 2026 00:00:00 GMT'
app.use('/api/*', async (c, next) => {
  await next()
  c.header('Deprecation', 'true')
  c.header('Sunset', DEPRECATION_SUNSET)
  c.header('Link', `</v1${c.req.path}>; rel="successor-version"`)
})

// ── Routes publiques ─────────────────────────────────────────
app.route('/v1/api/health', healthRouter)
app.route('/api/health',    healthRouter)

// WS et voice-realtime gèrent leur propre auth via query token — avant le middleware global
app.route('/v1/api/ws',    wsRouter)
app.route('/api/ws',       wsRouter)
app.route('/v1/api/voice', voiceRealtimeRouter)
app.route('/api/voice',    voiceRealtimeRouter)

// ── Routes protégées : auth middleware sur /api/* ET /v1/api/* ─────────
app.use('/api/*',    authMiddleware)
app.use('/v1/api/*', authMiddleware)

// Helper pour monter chaque router 2 fois (canonique + alias legacy).
const mountBoth = (path: string, router: any) => {
  app.route(`/v1${path}`, router)
  app.route(path,         router)
}

mountBoth('/api/auth',            authRouter)
mountBoth('/api/sessions',        sessionsRouter)
mountBoth('/api/chat',            chatRouter)
mountBoth('/api/agents',          agentsRouter)
mountBoth('/api/poles',           polesRouter)
mountBoth('/api/llm-config',      llmConfigRouter)
mountBoth('/api/command-bridge',  commandBridgeRouter)
mountBoth('/api',                 sprintsRouter)
mountBoth('/api',                 budgetRouter)
mountBoth('/api',                 crmRouter)
mountBoth('/api',                 auditRouter)
mountBoth('/api',                 deployRouter)
mountBoth('/api',                 serversRouter)
mountBoth('/api',                 documentsRouter)
mountBoth('/api',                 contratsRouter)
mountBoth('/api',                 incidentsRouter)
mountBoth('/api',                 socialRouter)
mountBoth('/api',                 gitpackRouter)
mountBoth('/api',                 briefRouter)
mountBoth('/api',                 okrRouter)
mountBoth('/api',                 facturationRouter)
mountBoth('/api',                 kbRouter)
mountBoth('/api',                 veilleRouter)
mountBoth('/api',                 agentFactoryRouter)
mountBoth('/api',                 webhooksRouter)
mountBoth('/api/netbird',         netbirdRouter)
mountBoth('/api/settings/api-keys', apiKeysRouter)
mountBoth('/api/orgs',            orgsRouter)
mountBoth('/api/voice',           voiceRouter)
mountBoth('/api',                 governorRouter)
mountBoth('/api',                 riskEngineRouter)
mountBoth('/api',                 injectionGuardRouter)
mountBoth('/api',                 agentAutonomyRouter)
mountBoth('/api',                 sloRouter)
mountBoth('/api',                 degradationRouter)
mountBoth('/api',                 memoryPalaceRouter)
mountBoth('/api',                 taskDagRouter)
mountBoth('/api',                 orchestratorRouter)
mountBoth('/api',                 automationRouter)
mountBoth('/api',                 morningBriefRouter)
mountBoth('/api',                 forecastRouter)
mountBoth('/api',                 venturesRouter)
mountBoth('/api',                 templatesRouter)
mountBoth('/api',                 devTeamRouter)
mountBoth('/api',                 analyticsRouter)
mountBoth('/api',                 searchRouter)
mountBoth('/api',                 teamRouter)
mountBoth('/api',                 imapRouter)
mountBoth('/api',                 calendarRouter)
mountBoth('/api',                 pushRouter)
mountBoth('/api',                 stripeRouter)
mountBoth('/api',                 rapportRouter)
mountBoth('/api',                 seoAgentRouter)
mountBoth('/api',                 contentAgentRouter)
mountBoth('/api',                 prospectionRouter)
mountBoth('/api',                 legalAgentRouter)
mountBoth('/api',                 sentinelRgpdRouter)
mountBoth('/api',                 keybindingsRouter)
mountBoth('/api',                 savedFiltersRouter)
mountBoth('/api',                 stagingRouter)
mountBoth('/api',                 auditLogsRouter)
mountBoth('/api',                 poleDevBridgeRouter)
mountBoth('/api',                 mcpRouter)
mountBoth('/api',                 skillsRouter)
mountBoth('/api',                 hitlRouter)
mountBoth('/api',                 repetitionRouter)
mountBoth('/api/conseil',         conseilRouter)
mountBoth('/api',                 pipelineTemplatesRouter)
// Metrics monte a la racine (Prometheus) — pas de versioning.
app.route('/',                    metricsRouter)
