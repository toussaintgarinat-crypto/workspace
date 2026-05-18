import {
  pgTable, text, timestamp, uuid, boolean, integer, unique, real, type AnyPgColumn
} from 'drizzle-orm/pg-core'

// ── LLM Presets (config hiérarchique venture→pole→tool→agent) ──
// scopeType + scopeId identifient l'entité concernée
// ventureId toujours rempli → agrégation coûts par venture
export const llmPresets = pgTable('llm_presets', {
  id:            uuid('id').primaryKey().defaultRandom(),
  scopeType:     text('scope_type', { enum: ['venture', 'pole', 'tool', 'agent', 'global'] }).notNull(),
  scopeId:       text('scope_id').notNull(),
  ventureId:     uuid('venture_id'),
  provider:      text('provider').notNull().default('ollama'),
  baseUrl:       text('base_url').default(''),
  apiKey:        text('api_key').default(''),
  model:         text('model').notNull().default('llama3.2'),
  maxTokens:     integer('max_tokens').default(2048),
  budgetDaily:   real('budget_daily'),
  budgetMonthly: real('budget_monthly'),
  updatedAt:     timestamp('updated_at').defaultNow().notNull(),
  updatedBy:     text('updated_by'),
}, (t) => ({ uniq: unique().on(t.scopeType, t.scopeId) }))

// ── Organisations (tenant) ───────────────────────────────────
export const organizations = pgTable('organizations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  nom:       text('nom').notNull(),
  slug:      text('slug').notNull().unique(),
  emoji:     text('emoji').default('🏢'),
  ownerId:   text('owner_id').notNull(),
  plan:      text('plan', { enum: ['personal', 'team', 'enterprise'] }).default('personal'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const organizationMembers = pgTable('organization_members', {
  id:       uuid('id').primaryKey().defaultRandom(),
  orgId:    uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId:   text('user_id').notNull(),
  role:     text('role', { enum: ['owner', 'admin', 'member'] }).default('member'),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.orgId, t.userId) }))

// ── Utilisateurs ─────────────────────────────────────────────
export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  email:        text('email').notNull().unique(),
  nom:          text('nom').notNull(),
  avatarEmoji:  text('avatar_emoji').default('👤'),
  keycloakSub:  text('keycloak_sub').unique(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

// ── Pôles (ex-Worlds) ────────────────────────────────────────
export const poles = pgTable('poles', {
  id:          uuid('id').primaryKey().defaultRandom(),
  nom:         text('nom').notNull(),
  description: text('description').default(''),
  emoji:       text('emoji').default('🌍'),
  couleur:     text('couleur').default('#6366f1'),
  type:        text('type', { enum: ['finance', 'marketing', 'sales', 'ops', 'legal', 'custom', 'dev'] }).default('custom'),
  ownerId:     text('owner_id').notNull(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  ventureId:   text('venture_id'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── Membres d'un pôle ────────────────────────────────────────
export const poleMembers = pgTable('pole_members', {
  id:          uuid('id').primaryKey().defaultRandom(),
  poleId:      uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  nom:         text('nom').notNull(),
  avatarEmoji: text('avatar_emoji').default('👤'),
  role:        text('role', { enum: ['owner', 'admin', 'member'] }).default('member'),
  joinedAt:    timestamp('joined_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.poleId, t.userId) }))

// ── Config LLM par pôle ──────────────────────────────────────
export const llmConfigs = pgTable('llm_configs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  poleId:    uuid('pole_id').notNull().unique().references(() => poles.id, { onDelete: 'cascade' }),
  provider:  text('provider').default('ollama'),
  baseUrl:   text('base_url').default(''),
  apiKey:    text('api_key').default(''),
  model:     text('model').default('llama3.2'),
  maxTokens: integer('max_tokens').default(2048),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: text('updated_by'),
})

// ── Sessions de conversation ─────────────────────────────────
export const sessions = pgTable('sessions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name:      text('name').notNull().default('New conversation'),
  poleId:    uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  ventureId: uuid('venture_id').references((): AnyPgColumn => ventures.id, { onDelete: 'set null' }),
  scope:     text('scope', { enum: ['user', 'pole', 'venture'] }).notNull().default('user'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Messages d'une session ───────────────────────────────────
export const messages = pgTable('messages', {
  id:        uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  role:      text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content:   text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Décisions N0 (validations fondateur) ────────────────────
export const decisionsN0 = pgTable('decisions_n0', {
  id:          uuid('id').primaryKey().defaultRandom(),
  poleId:      uuid('pole_id').references(() => poles.id, { onDelete: 'cascade' }),
  poleNom:     text('pole_nom').notNull(),
  agentNom:    text('agent_nom').notNull(),
  action:      text('action').notNull(),
  niveau:      text('niveau', { enum: ['N0', 'N1', 'N2', 'N3'] }).default('N0'),
  statut:      text('statut', { enum: ['en_attente', 'approuve', 'rejete'] }).default('en_attente'),
  urgence:     text('urgence', { enum: ['haute', 'normale', 'basse'] }).default('normale'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  resolvedAt:  timestamp('resolved_at'),
  resolvedBy:  text('resolved_by'),
})

// ── Kill switches par pôle ───────────────────────────────────
export const killSwitches = pgTable('kill_switches', {
  poleId:    uuid('pole_id').primaryKey().references(() => poles.id, { onDelete: 'cascade' }),
  enPause:   boolean('en_pause').default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: text('updated_by'),
})

// ── Événements Blackboard ────────────────────────────────────
export const blackboardEvents = pgTable('blackboard_events', {
  id:        uuid('id').primaryKey().defaultRandom(),
  poleId:    uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  poleNom:   text('pole_nom').notNull(),
  poleEmoji: text('pole_emoji').default(''),
  agentNom:  text('agent_nom').notNull(),
  type:      text('type').notNull(),
  payload:   text('payload').notNull(),
  niveau:    text('niveau', { enum: ['N0', 'N1', 'N2', 'N3'] }).default('N1'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Artefacts générés ────────────────────────────────────────
export const artifacts = pgTable('artifacts', {
  id:        uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  type:      text('type', { enum: ['code', 'file', 'branch', 'test_result'] }).notNull(),
  payload:   text('payload').notNull(),
  status:    text('status', { enum: ['pending', 'approved', 'rejected'] }).default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Sprints ──────────────────────────────────────────────────
export const sprints = pgTable('sprints', {
  id:        uuid('id').primaryKey().defaultRandom(),
  poleId:    uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  nom:       text('nom').notNull(),
  objectif:  text('objectif').default(''),
  statut:    text('statut', { enum: ['actif', 'termine', 'archive'] }).default('actif'),
  dateDebut: timestamp('date_debut').defaultNow().notNull(),
  dateFin:   timestamp('date_fin'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Tâches ───────────────────────────────────────────────────
export const tasks = pgTable('tasks', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sprintId:    uuid('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
  poleId:      uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  titre:       text('titre').notNull(),
  description: text('description').default(''),
  statut:      text('statut', { enum: ['todo', 'en_cours', 'done'] }).default('todo'),
  priorite:    text('priorite', { enum: ['haute', 'normale', 'basse'] }).default('normale'),
  assigneA:    text('assigne_a'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── Budget ───────────────────────────────────────────────────
export const budgetEntries = pgTable('budget_entries', {
  id:         uuid('id').primaryKey().defaultRandom(),
  poleId:     uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:     text('user_id').notNull(),
  label:      text('label').notNull(),
  montant:    integer('montant').notNull(),
  type:       text('type', { enum: ['recette', 'depense'] }).notNull(),
  categorie:  text('categorie').default(''),
  date:       timestamp('date').defaultNow().notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

// ── CRM Leads ────────────────────────────────────────────────
export const crmLeads = pgTable('crm_leads', {
  id:          uuid('id').primaryKey().defaultRandom(),
  poleId:      uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  nom:         text('nom').notNull(),
  email:       text('email').default(''),
  telephone:   text('telephone').default(''),
  entreprise:  text('entreprise').default(''),
  statut:      text('statut', { enum: ['prospect', 'qualifie', 'gagne', 'perdu'] }).default('prospect'),
  valeur:      integer('valeur').default(0),
  notes:       text('notes').default(''),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── Missions d'audit ─────────────────────────────────────────
export const auditMissions = pgTable('audit_missions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  poleId:      uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  titre:       text('titre').notNull(),
  description: text('description').default(''),
  statut:      text('statut', { enum: ['brouillon', 'actif', 'termine'] }).default('brouillon'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── Pôles d'une mission d'audit ──────────────────────────────
export const auditMissionPoles = pgTable('audit_mission_poles', {
  id:        uuid('id').primaryKey().defaultRandom(),
  missionId: uuid('mission_id').notNull().references(() => auditMissions.id, { onDelete: 'cascade' }),
  poleId:    uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
})

// ── Documents d'audit ────────────────────────────────────────
export const auditDocuments = pgTable('audit_documents', {
  id:         uuid('id').primaryKey().defaultRandom(),
  missionId:  uuid('mission_id').notNull().references(() => auditMissions.id, { onDelete: 'cascade' }),
  userId:     text('user_id').notNull(),
  nom:        text('nom').notNull(),
  type:       text('type').default('pdf'),
  contenu:    text('contenu').default(''),
  analyse:    text('analyse').default(''),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

// ── Comptes sociaux ──────────────────────────────────────────
export const socialAccounts = pgTable('social_accounts', {
  id:        uuid('id').primaryKey().defaultRandom(),
  poleId:    uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  platform:  text('platform').notNull(),
  nom:       text('nom').default(''),
  config:    text('config').default('{}'),
  actif:     boolean('actif').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Contrats ─────────────────────────────────────────────────
export const contrats = pgTable('contrats', {
  id:         uuid('id').primaryKey().defaultRandom(),
  poleId:     uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:     text('user_id').notNull(),
  titre:      text('titre').notNull(),
  type:       text('type').default('Autre'),
  parties:    text('parties').default(''),
  contenu:    text('contenu').default(''),
  valeur:     integer('valeur').default(0),
  statut:     text('statut', { enum: ['brouillon', 'actif', 'signe', 'expire', 'resilie'] }).default('brouillon'),
  dateDebut:  text('date_debut').default(''),
  dateFin:    text('date_fin').default(''),
  notes:      text('notes').default(''),
  signePar:   text('signe_par'),
  signeAt:    timestamp('signe_at'),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
  updatedAt:  timestamp('updated_at').defaultNow().notNull(),
})

// ── Incidents ────────────────────────────────────────────────
export const incidents = pgTable('incidents', {
  id:          uuid('id').primaryKey().defaultRandom(),
  poleId:      uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  titre:       text('titre').notNull(),
  description: text('description').default(''),
  severite:    text('severite', { enum: ['critique', 'haute', 'moyenne', 'basse'] }).default('moyenne'),
  statut:      text('statut', { enum: ['ouvert', 'en_cours', 'resolu', 'ferme'] }).default('ouvert'),
  resolvedAt:  timestamp('resolved_at'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── GitPack Jobs ─────────────────────────────────────────────
export const gitpackJobs = pgTable('gitpack_jobs', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     text('user_id').notNull(),
  orgId:      uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  githubUrl:  text('github_url').notNull(),
  platform:   text('platform').default('macos'),
  statut:     text('statut', { enum: ['pending', 'running', 'done', 'error'] }).default('pending'),
  language:   text('language'),
  framework:  text('framework'),
  logs:       text('logs').default('[]'),
  error:      text('error'),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
  updatedAt:  timestamp('updated_at').defaultNow().notNull(),
})

// ── Documents PDF uploadés ───────────────────────────────────
export const documents = pgTable('documents', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  poleId:    uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  nom:       text('nom').notNull(),
  type:      text('type').default('pdf'),
  contenu:   text('contenu').notNull(),
  analyse:   text('analyse').default(''),
  taille:    integer('taille').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── OKRs ─────────────────────────────────────────────────────
export const okrs = pgTable('okrs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull(),
  poleId:      uuid('pole_id').references(() => poles.id, { onDelete: 'cascade' }),
  titre:       text('titre').notNull(),
  description: text('description').default(''),
  statut:      text('statut', { enum: ['actif', 'atteint', 'abandonne'] }).default('actif'),
  periode:     text('periode').default(''),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

export const keyResults = pgTable('key_results', {
  id:              uuid('id').primaryKey().defaultRandom(),
  okrId:           uuid('okr_id').notNull().references(() => okrs.id, { onDelete: 'cascade' }),
  titre:           text('titre').notNull(),
  valeurCible:     real('valeur_cible').default(100),
  valeurActuelle:  real('valeur_actuelle').default(0),
  unite:           text('unite').default('%'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
})

// ── Facturation ──────────────────────────────────────────────
export const facturesDocs = pgTable('factures_docs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        text('user_id').notNull(),
  poleId:        uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  numero:        text('numero').notNull(),
  type:          text('type', { enum: ['facture', 'devis'] }).default('facture'),
  clientNom:     text('client_nom').notNull(),
  clientEmail:   text('client_email').default(''),
  clientAdresse: text('client_adresse').default(''),
  lignes:        text('lignes').default('[]'),
  totalHt:       real('total_ht').default(0),
  totalTva:      real('total_tva').default(0),
  totalTtc:      real('total_ttc').default(0),
  tvaRaux:       real('tva_taux').default(20),
  statut:        text('statut').default('brouillon'),
  notes:         text('notes').default(''),
  conditions:    text('conditions').default('Paiement à 30 jours'),
  dateEmission:  text('date_emission').default(''),
  dateEcheance:  text('date_echeance').default(''),
  datePaiement:  text('date_paiement').default(''),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
  updatedAt:     timestamp('updated_at').defaultNow().notNull(),
})

// ── Knowledge Base ───────────────────────────────────────────
export const kbArticles = pgTable('kb_articles', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  titre:     text('titre').notNull(),
  contenu:   text('contenu').default(''),
  tags:      text('tags').default('[]'),
  isPinned:  boolean('is_pinned').default(false),
  isPublic:  boolean('is_public').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Veille RSS ───────────────────────────────────────────────
export const veilleSources = pgTable('veille_sources', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  nom:       text('nom').notNull(),
  url:       text('url').notNull(),
  type:      text('type').default('rss'),
  enabled:   boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const veilleArticles = pgTable('veille_articles', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull(),
  sourceId:    uuid('source_id').references(() => veilleSources.id, { onDelete: 'cascade' }),
  titre:       text('titre').notNull(),
  url:         text('url').notNull(),
  resume:      text('resume').default(''),
  lu:          boolean('lu').default(false),
  publishedAt: text('published_at').default(''),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── Agent Factory ────────────────────────────────────────────
export const agentDefinitions = pgTable('agent_definitions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       text('user_id').notNull(),
  poleId:       uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  nom:          text('nom').notNull(),
  description:  text('description').default(''),
  instructions: text('instructions').default(''),
  niveau:       text('niveau', { enum: ['local', 'medium', 'api'] }).default('medium'),
  statut:       text('statut', { enum: ['active', 'draft', 'disabled', 'error'] }).default('draft'),
  llmPreset:    text('llm_preset').default(''),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
})

// ── Webhooks ─────────────────────────────────────────────────
export const webhooks = pgTable('webhooks', {
  id:      uuid('id').primaryKey().defaultRandom(),
  userId:  text('user_id').notNull(),
  orgId:   uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  nom:     text('nom').notNull(),
  url:     text('url').notNull(),
  events:  text('events').default('[]'),
  enabled: boolean('enabled').default(true),
  secret:  text('secret').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Clés API fournisseurs (chiffrées AES-256-GCM) ───────────
export const providerApiKeys = pgTable('provider_api_keys', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       text('user_id').notNull(),
  orgId:        uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  provider:     text('provider').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  hint:         text('hint').default(''),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.userId, t.provider) }))

// ── Ventures (multi-projet) ──────────────────────────────────
export const ventures = pgTable('ventures', {
  id:          uuid('id').primaryKey().defaultRandom(),
  ownerId:     text('owner_id').notNull(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  nom:         text('nom').notNull(),
  description: text('description').default(''),
  emoji:       text('emoji').default('🚀'),
  couleur:     text('couleur').default('#6366f1'),
  type:        text('type', { enum: ['own', 'audit'] }).default('own'),
  statut:      text('statut', { enum: ['actif', 'archive', 'livre'] }).default('actif'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

export const ventureMembers = pgTable('venture_members', {
  id:        uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').notNull().references(() => ventures.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  role:      text('role', { enum: ['owner', 'admin', 'member', 'viewer'] }).default('member'),
  joinedAt:  timestamp('joined_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.ventureId, t.userId) }))

// ── Tokens de suppression venture (confirmation email) ───────
export const ventureDeleteTokens = pgTable('venture_delete_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').notNull().references(() => ventures.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  code:      text('code').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt:    timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Governor — budget tokens ─────────────────────────────────
export const governorConfigs = pgTable('governor_configs', {
  id:              uuid('id').primaryKey().defaultRandom(),
  orgId:           uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:          text('user_id').notNull(),
  budgetJournalier: integer('budget_journalier').default(100000),
  budgetMensuel:   integer('budget_mensuel').default(2000000),
  alerteSeuil:     integer('alerte_seuil').default(80),
  blocageSeuil:    integer('blocage_seuil').default(95),
  actif:           boolean('actif').default(true),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
})

export const governorUsage = pgTable('governor_usage', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  ventureId:   uuid('venture_id').references((): AnyPgColumn => ventures.id, { onDelete: 'set null' }),
  poleId:      uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  provider:    text('provider').notNull(),
  model:       text('model').notNull(),
  tokensIn:    integer('tokens_in').default(0),
  tokensOut:   integer('tokens_out').default(0),
  coutUsd:     real('cout_usd').default(0),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── Risk Engine ──────────────────────────────────────────────
export const riskLogs = pgTable('risk_logs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  poleId:      uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  action:      text('action').notNull(),
  score:       integer('score').default(0),
  niveau:      text('niveau', { enum: ['faible', 'moyen', 'eleve', 'critique'] }).default('faible'),
  fastPath:    boolean('fast_path').default(false),
  approuve:    boolean('approuve').default(false),
  raison:      text('raison').default(''),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── Injection Guard ──────────────────────────────────────────
export const injectionLogs = pgTable('injection_logs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  input:     text('input').notNull(),
  flagged:   boolean('flagged').default(false),
  raison:    text('raison').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Agent Autonomy (N0-N3 par agent) ────────────────────────
export const agentAutonomyRules = pgTable('agent_autonomy_rules', {
  id:          uuid('id').primaryKey().defaultRandom(),
  agentId:     uuid('agent_id').notNull().references(() => agentDefinitions.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  niveau:      text('niveau', { enum: ['N0', 'N1', 'N2', 'N3'] }).default('N1'),
  horaires:    text('horaires').default('{}'),
  overrideOk:  boolean('override_ok').default(false),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── Agent Feedback ───────────────────────────────────────────
export const agentFeedback = pgTable('agent_feedback', {
  id:        uuid('id').primaryKey().defaultRandom(),
  agentId:   uuid('agent_id').notNull().references(() => agentDefinitions.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  rating:    integer('rating').default(3),
  commentaire: text('commentaire').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Agent Runs & Scores ──────────────────────────────────────
export const agentRuns = pgTable('agent_runs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  agentId:     uuid('agent_id').references(() => agentDefinitions.id, { onDelete: 'set null' }),
  userId:      text('user_id').notNull(),
  poleId:      uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  statut:      text('statut', { enum: ['running', 'done', 'error', 'cancelled'] }).default('running'),
  input:       text('input').default(''),
  output:      text('output').default(''),
  tokensIn:    integer('tokens_in').default(0),
  tokensOut:   integer('tokens_out').default(0),
  dureeMs:     integer('duree_ms').default(0),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
})

export const agentScores = pgTable('agent_scores', {
  id:              uuid('id').primaryKey().defaultRandom(),
  agentId:         uuid('agent_id').notNull().references(() => agentDefinitions.id, { onDelete: 'cascade' }),
  confianceScore:  real('confiance_score').default(0),
  riskLevel:       text('risk_level', { enum: ['faible', 'moyen', 'eleve'] }).default('faible'),
  retroFeedback:   text('retro_feedback').default(''),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
})

// ── SLO Dashboard ────────────────────────────────────────────
export const sloEntries = pgTable('slo_entries', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  module:    text('module').notNull(),
  healthScore: integer('health_score').default(100),
  sloTarget: real('slo_target').default(99.9),
  sloCurrent: real('slo_current').default(100),
  erreurs24h: integer('erreurs_24h').default(0),
  updatedAt:  timestamp('updated_at').defaultNow().notNull(),
})

// ── Degradation ──────────────────────────────────────────────
export const degradationModes = pgTable('degradation_modes', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  ressource: text('ressource').notNull(),
  actif:     boolean('actif').default(false),
  graceMode: boolean('grace_mode').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const degradationEpisodes = pgTable('degradation_episodes', {
  id:           uuid('id').primaryKey().defaultRandom(),
  modeId:       uuid('mode_id').notNull().references(() => degradationModes.id, { onDelete: 'cascade' }),
  dureeMinutes: integer('duree_minutes').default(0),
  raison:       text('raison').default(''),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

// ── Memory Palace ────────────────────────────────────────────
export const memoryEntries = pgTable('memory_entries', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  agentId:   uuid('agent_id').references(() => agentDefinitions.id, { onDelete: 'set null' }),
  cle:       text('cle').notNull(),
  valeur:    text('valeur').notNull(),
  type:      text('type', { enum: ['context', 'fact', 'preference', 'history'] }).default('context'),
  ttl:       timestamp('ttl'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Task DAG ─────────────────────────────────────────────────
export const taskDagItems = pgTable('task_dag_items', {
  id:          uuid('id').primaryKey().defaultRandom(),
  poleId:      uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  nom:         text('nom').notNull(),
  description: text('description').default(''),
  agentOwner:  text('agent_owner').default(''),
  dependances: text('dependances').default('[]'),
  statut:      text('statut', { enum: ['pending', 'running', 'done', 'error'] }).default('pending'),
  criticite:   text('criticite', { enum: ['faible', 'normale', 'haute', 'critique'] }).default('normale'),
  nodeType:    text('node_type', { enum: ['agent', 'prompt'] }).default('agent'),
  posX:        real('pos_x').default(0),
  posY:        real('pos_y').default(0),
  promptText:  text('prompt_text').default(''),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── Pipeline Templates ────────────────────────────────────────
export const pipelineTemplates = pgTable('pipeline_templates', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id'),
  nom:         text('nom').notNull(),
  description: text('description').default(''),
  icon:        text('icon').default('🔄'),
  categorie:   text('categorie').default(''),
  nodes:       text('nodes').default('[]'),
  edges:       text('edges').default('[]'),
  isPublic:    boolean('is_public').default(false),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── Orchestrator Sessions ────────────────────────────────────
export const orchestratorSessions = pgTable('orchestrator_sessions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  poleId:    uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  titre:     text('titre').notNull(),
  agents:    text('agents').default('[]'),
  statut:    text('statut', { enum: ['actif', 'termine', 'erreur'] }).default('actif'),
  output:    text('output').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Automation Rules ─────────────────────────────────────────
export const automationRules = pgTable('automation_rules', {
  id:          uuid('id').primaryKey().defaultRandom(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  nom:         text('nom').notNull(),
  description: text('description').default(''),
  trigger:     text('trigger').notNull(),
  conditions:  text('conditions').default('{}'),
  actions:     text('actions').default('[]'),
  actif:       boolean('actif').default(true),
  executions:  integer('executions').default(0),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── Morning Brief ────────────────────────────────────────────
export const briefConfigs = pgTable('brief_configs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull().unique(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  enabled:     boolean('enabled').default(true),
  heureUtc:    text('heure_utc').default('07:00'),
  joursSemaine: text('jours_semaine').default('[1,2,3,4,5]'),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

export const briefs = pgTable('briefs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  titre:     text('titre').notNull(),
  contenu:   text('contenu').notNull(),
  type:      text('type', { enum: ['morning', 'weekly', 'manual'] }).default('morning'),
  lu:        boolean('lu').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Forecast ─────────────────────────────────────────────────
export const forecastEntries = pgTable('forecast_entries', {
  id:         uuid('id').primaryKey().defaultRandom(),
  poleId:     uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:     text('user_id').notNull(),
  anneeMois:  text('annee_mois').notNull(),
  montant:    real('montant').notNull(),
  categorie:  text('categorie').default(''),
  type:       text('type', { enum: ['recette', 'depense'] }).default('recette'),
  source:     text('source', { enum: ['manuel', 'llm'] }).default('manuel'),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

// ── Templates ────────────────────────────────────────────────
export const templates = pgTable('templates', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  nom:         text('nom').notNull(),
  description: text('description').default(''),
  type:        text('type', { enum: ['contrat', 'email', 'rapport', 'brief', 'autre'] }).default('autre'),
  contenu:     text('contenu').notNull(),
  variables:   text('variables').default('[]'),
  public:      boolean('public').default(false),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── Dev Team Kanban ──────────────────────────────────────────
export const devTasks = pgTable('dev_tasks', {
  id:          uuid('id').primaryKey().defaultRandom(),
  poleId:      uuid('pole_id').references(() => poles.id, { onDelete: 'set null' }),
  userId:      text('user_id').notNull(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  titre:       text('titre').notNull(),
  description: text('description').default(''),
  type:        text('type', { enum: ['bug', 'feature', 'chore', 'doc', 'refactor'] }).default('feature'),
  statut:      text('statut', { enum: ['backlog', 'todo', 'en_cours', 'review', 'done'] }).default('backlog'),
  priorite:    text('priorite', { enum: ['haute', 'normale', 'basse'] }).default('normale'),
  agentIA:     text('agent_ia').default(''),
  analyseLLM:  text('analyse_llm').default(''),
  tempsEstime: integer('temps_estime').default(0),
  assigneA:    text('assigne_a').default(''),
  deadline:    timestamp('deadline'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── Keybindings ──────────────────────────────────────────────
export const keybindings = pgTable('keybindings', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  touche:    text('touche').notNull(),
  action:    text('action').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.userId, t.touche) }))

// ── Saved Filters ────────────────────────────────────────────
export const savedFilters = pgTable('saved_filters', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  nom:       text('nom').notNull(),
  contexte:  text('contexte').default(''),
  filtre:    text('filtre').default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Tool LLM Config ──────────────────────────────────────────
export const toolLlmConfigs = pgTable('tool_llm_configs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  toolId:    text('tool_id').notNull(),
  provider:  text('provider').notNull(),
  model:     text('model').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.orgId, t.toolId) }))

// ── Push Subscriptions ───────────────────────────────────────
export const pushSubscriptions = pgTable('push_subscriptions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  endpoint:  text('endpoint').notNull(),
  p256dh:    text('p256dh').notNull(),
  auth:      text('auth').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── IMAP / Email ─────────────────────────────────────────────
export const imapConfigs = pgTable('imap_configs', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           text('user_id').notNull(),
  host:             text('host').notNull(),
  port:             integer('port').default(993),
  email:            text('email').notNull(),
  passwordEncrypted: text('password_encrypted').notNull(),
  actif:            boolean('actif').default(true),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at').defaultNow().notNull(),
})

export const imapEmails = pgTable('imap_emails', {
  id:         uuid('id').primaryKey().defaultRandom(),
  configId:   uuid('config_id').notNull().references(() => imapConfigs.id, { onDelete: 'cascade' }),
  messageId:  text('message_id').notNull(),
  sujet:      text('sujet').default(''),
  expediteur: text('expediteur').default(''),
  corps:      text('corps').default(''),
  lu:         boolean('lu').default(false),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

// ── Google Calendar ──────────────────────────────────────────
export const googleOauthTokens = pgTable('google_oauth_tokens', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       text('user_id').notNull().unique(),
  accessToken:  text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt:    timestamp('expires_at'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

export const agendaEvents = pgTable('agenda_events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  titre:       text('titre').notNull(),
  description: text('description').default(''),
  dateDebut:   timestamp('date_debut').notNull(),
  dateFin:     timestamp('date_fin'),
  pole:        text('pole').default(''),
  googleId:    text('google_id').default(''),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── Team Members ─────────────────────────────────────────────
export const teamMembers = pgTable('team_members', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  nom:       text('nom').notNull(),
  email:     text('email').default(''),
  role:      text('role', { enum: ['founder', 'admin', 'agent', 'viewer'] }).default('viewer'),
  poles:     text('poles').default('[]'),
  statut:    text('statut', { enum: ['actif', 'invite', 'inactif'] }).default('actif'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Stripe / Abonnements ─────────────────────────────────────
export const abonnements = pgTable('abonnements', {
  id:            uuid('id').primaryKey().defaultRandom(),
  orgId:         uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  plan:          text('plan', { enum: ['free', 'starter', 'pro', 'enterprise'] }).default('free'),
  statut:        text('statut', { enum: ['actif', 'annule', 'en_retard', 'trial'] }).default('trial'),
  stripeSubId:   text('stripe_sub_id').default(''),
  periodeFin:    timestamp('periode_fin'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
  updatedAt:     timestamp('updated_at').defaultNow().notNull(),
})

export const stripePayments = pgTable('stripe_payments', {
  id:              uuid('id').primaryKey().defaultRandom(),
  orgId:           uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:          text('user_id').notNull(),
  stripeSessionId: text('stripe_session_id').notNull(),
  montant:         integer('montant').default(0),
  devise:          text('devise').default('eur'),
  statut:          text('statut', { enum: ['pending', 'complete', 'failed'] }).default('pending'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  completedAt:     timestamp('completed_at'),
})

// ── Rapports auto-générés ────────────────────────────────────
export const rapports = pgTable('rapports', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  titre:       text('titre').notNull(),
  contenu:     text('contenu').notNull(),
  type:        text('type', { enum: ['weekly', 'monthly', 'audit', 'custom'] }).default('weekly'),
  periode:     text('periode').default(''),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── Staging Lane (meta-learning) ─────────────────────────────
export const stagingProposals = pgTable('staging_proposals', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  contenu:   text('contenu').notNull(),
  scoreMea:  real('score_mea').default(0),
  statut:    text('statut', { enum: ['pending', 'approuve', 'rejete'] }).default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Audit Logs (journal immuable) ────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  userNom:   text('user_nom').default(''),
  action:    text('action').notNull(),
  entite:    text('entite').notNull(),
  entiteId:  text('entite_id').default(''),
  pole:      text('pole').default(''),
  details:   text('details').default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Catalogue d'outils ───────────────────────────────────────
// Définit tous les outils disponibles dans Forge.
// commun=true → disponible pour tous les pôles (instance par pôle)
// polesDedies → liste JSON des types de pôles si outil dédié (ex: ["finance","legal"])
export const toolCatalog = pgTable('tool_catalog', {
  id:          uuid('id').primaryKey().defaultRandom(),
  key:         text('key').notNull().unique(),
  label:       text('label').notNull(),
  icon:        text('icon').default('🔧'),
  description: text('description').default(''),
  commun:      boolean('commun').default(true),
  polesDedies: text('poles_dedies').default('[]'),
  ordre:       integer('ordre').default(0),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── Outils activés par pôle ──────────────────────────────────
// Chaque pôle a sa liste d'outils activés, avec ordre personnalisé.
export const poleTools = pgTable('pole_tools', {
  id:        uuid('id').primaryKey().defaultRandom(),
  poleId:    uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  toolKey:   text('tool_key').notNull(),
  enabled:   boolean('enabled').default(true),
  ordre:     integer('ordre').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.poleId, t.toolKey) }))

// ── Demandes d'automatisation inter-pôles ────────────────────
// Un pôle soumet une tâche répétitive au Pôle Dev pour automatisation.
export const poleDevRequests = pgTable('pole_dev_requests', {
  id:               uuid('id').primaryKey().defaultRandom(),
  sourcePoleId:     uuid('source_pole_id').notNull(),
  sourcePoleName:   text('source_pole_name').notNull(),
  sourcePoleEmoji:  text('source_pole_emoji').default('📌'),
  title:            text('title').notNull(),
  description:      text('description').notNull(),
  frequency:        text('frequency').default('manual'),  // daily, weekly, on_event, manual
  priority:         text('priority').default('medium'),   // low, medium, high, critical
  status:           text('status').default('pending'),    // pending, analyzing, building, deployed, rejected
  analysis:         text('analysis'),
  proposedSolution: text('proposed_solution'),
  automationRuleId: uuid('automation_rule_id'),
  rejectionReason:  text('rejection_reason'),
  userId:           text('user_id').notNull(),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at').defaultNow().notNull(),
})

// ── MCP Servers ───────────────────────────────────────────────
export const mcpServers = pgTable('mcp_servers', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  orgId:     uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  ventureId: uuid('venture_id').references(() => ventures.id, { onDelete: 'cascade' }),
  poleId:    uuid('pole_id').references(() => poles.id, { onDelete: 'cascade' }),
  nom:       text('nom').notNull(),
  url:       text('url').notNull(),
  authType:  text('auth_type', { enum: ['none', 'bearer', 'basic'] }).default('none'),
  authToken: text('auth_token').default(''),
  actif:     boolean('actif').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Skills (SKILL.md) ─────────────────────────────────────────
export const skills = pgTable('skills', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull(),
  orgId:       uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  ventureId:   uuid('venture_id').references(() => ventures.id, { onDelete: 'cascade' }),
  poleId:      uuid('pole_id').references(() => poles.id, { onDelete: 'cascade' }),
  nom:         text('nom').notNull(),
  description: text('description').default(''),
  tags:        text('tags').default('[]'),
  skillMd:     text('skill_md').notNull(),
  actif:       boolean('actif').default(true),
  global:      boolean('global').default(false),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

// ── HITL Requests ─────────────────────────────────────────────
export const hitlRequests = pgTable('hitl_requests', {
  id:        uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  niveau:    integer('niveau').default(1),
  action:    text('action').notNull(),
  payload:   text('payload').default('{}'),
  statut:    text('statut', { enum: ['pending', 'approved', 'rejected', 'timeout'] }).default('pending'),
  decidePar: text('decide_par'),
  decideAt:  timestamp('decide_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Détection répétition → Pôle Dev ──────────────────────────
export const repetitionConfigs = pgTable('repetition_configs', {
  id:               uuid('id').primaryKey().defaultRandom(),
  poleId:           uuid('pole_id').notNull().unique().references(() => poles.id, { onDelete: 'cascade' }),
  seuilOccurrences: integer('seuil_occurrences').default(3),
  periodeJours:     integer('periode_jours').default(7),
  silenceDays:      integer('silence_days').default(30),
  actif:            boolean('actif').default(true),
  updatedAt:        timestamp('updated_at').defaultNow().notNull(),
})

export const repetitionEvents = pgTable('repetition_events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  poleId:      uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull(),
  actionKey:   text('action_key').notNull(),
  actionLabel: text('action_label').notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

export const repetitionSilences = pgTable('repetition_silences', {
  id:           uuid('id').primaryKey().defaultRandom(),
  poleId:       uuid('pole_id').notNull().references(() => poles.id, { onDelete: 'cascade' }),
  actionKey:    text('action_key').notNull(),
  silenceUntil: timestamp('silence_until').notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.poleId, t.actionKey) }))

// ── Prometheus Metrics Snapshots ──────────────────────────────
export const metricsSnapshots = pgTable('metrics_snapshots', {
  id:        uuid('id').primaryKey().defaultRandom(),
  data:      text('data').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
