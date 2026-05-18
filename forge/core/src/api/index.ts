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

export const app = new Hono()

// ── Middleware global ────────────────────────────────────────
app.use('*', logger())
app.use('*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  allowHeaders: ['Content-Type', 'Authorization', 'X-Org-ID'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

// ── Routes publiques ─────────────────────────────────────────
app.route('/api/health', healthRouter)

// WS et voice-realtime gèrent leur propre auth via query token — avant le middleware global
app.route('/api/ws',    wsRouter)
app.route('/api/voice', voiceRealtimeRouter)

// ── Routes protégées ─────────────────────────────────────────
app.use('/api/*', authMiddleware)
app.route('/api/auth', authRouter)
app.route('/api/sessions',   sessionsRouter)
app.route('/api/chat',       chatRouter)
app.route('/api/agents',     agentsRouter)
app.route('/api/poles',      polesRouter)
app.route('/api/llm-config', llmConfigRouter)
app.route('/api/command-bridge', commandBridgeRouter)
app.route('/api',                sprintsRouter)
app.route('/api',                budgetRouter)
app.route('/api',                crmRouter)
app.route('/api',                auditRouter)
app.route('/api',                documentsRouter)
app.route('/api',                contratsRouter)
app.route('/api',                incidentsRouter)
app.route('/api',                socialRouter)
app.route('/api',                gitpackRouter)
app.route('/api',                briefRouter)
app.route('/api',                okrRouter)
app.route('/api',                facturationRouter)
app.route('/api',                kbRouter)
app.route('/api',                veilleRouter)
app.route('/api',                agentFactoryRouter)
app.route('/api',                webhooksRouter)
app.route('/api/netbird',        netbirdRouter)
app.route('/api/settings/api-keys', apiKeysRouter)
app.route('/api/orgs',             orgsRouter)
app.route('/api/voice',            voiceRouter)
app.route('/api',                  governorRouter)
app.route('/api',                  riskEngineRouter)
app.route('/api',                  injectionGuardRouter)
app.route('/api',                  agentAutonomyRouter)
app.route('/api',                  sloRouter)
app.route('/api',                  degradationRouter)
app.route('/api',                  memoryPalaceRouter)
app.route('/api',                  taskDagRouter)
app.route('/api',                  orchestratorRouter)
app.route('/api',                  automationRouter)
app.route('/api',                  morningBriefRouter)
app.route('/api',                  forecastRouter)
app.route('/api',                  venturesRouter)
app.route('/api',                  templatesRouter)
app.route('/api',                  devTeamRouter)
app.route('/api',                  analyticsRouter)
app.route('/api',                  searchRouter)
app.route('/api',                  teamRouter)
app.route('/api',                  imapRouter)
app.route('/api',                  calendarRouter)
app.route('/api',                  pushRouter)
app.route('/api',                  stripeRouter)
app.route('/api',                  rapportRouter)
app.route('/api',                  seoAgentRouter)
app.route('/api',                  contentAgentRouter)
app.route('/api',                  prospectionRouter)
app.route('/api',                  legalAgentRouter)
app.route('/api',                  sentinelRgpdRouter)
app.route('/api',                  keybindingsRouter)
app.route('/api',                  savedFiltersRouter)
app.route('/api',                  stagingRouter)
app.route('/api',                  auditLogsRouter)
app.route('/api',                  poleDevBridgeRouter)
app.route('/api',                  mcpRouter)
app.route('/api',                  skillsRouter)
app.route('/api',                  hitlRouter)
app.route('/api',                  repetitionRouter)
app.route('/api/conseil',          conseilRouter)
app.route('/api',                  pipelineTemplatesRouter)
app.route('/',                     metricsRouter)
