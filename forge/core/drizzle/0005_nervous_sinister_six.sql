CREATE TABLE IF NOT EXISTS "abonnements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan" text DEFAULT 'free',
	"statut" text DEFAULT 'trial',
	"stripe_sub_id" text DEFAULT '',
	"periode_fin" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agenda_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"titre" text NOT NULL,
	"description" text DEFAULT '',
	"date_debut" timestamp NOT NULL,
	"date_fin" timestamp,
	"pole" text DEFAULT '',
	"google_id" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_autonomy_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"niveau" text DEFAULT 'N1',
	"horaires" text DEFAULT '{}',
	"override_ok" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer DEFAULT 3,
	"commentaire" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"user_id" text NOT NULL,
	"pole_id" uuid,
	"statut" text DEFAULT 'running',
	"input" text DEFAULT '',
	"output" text DEFAULT '',
	"tokens_in" integer DEFAULT 0,
	"tokens_out" integer DEFAULT 0,
	"duree_ms" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"confiance_score" real DEFAULT 0,
	"risk_level" text DEFAULT 'faible',
	"retro_feedback" text DEFAULT '',
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" text NOT NULL,
	"user_nom" text DEFAULT '',
	"action" text NOT NULL,
	"entite" text NOT NULL,
	"entite_id" text DEFAULT '',
	"pole" text DEFAULT '',
	"details" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" text NOT NULL,
	"nom" text NOT NULL,
	"description" text DEFAULT '',
	"trigger" text NOT NULL,
	"conditions" text DEFAULT '{}',
	"actions" text DEFAULT '[]',
	"actif" boolean DEFAULT true,
	"executions" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brief_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"enabled" boolean DEFAULT true,
	"heure_utc" text DEFAULT '07:00',
	"jours_semaine" text DEFAULT '[1,2,3,4,5]',
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brief_configs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"titre" text NOT NULL,
	"contenu" text NOT NULL,
	"type" text DEFAULT 'morning',
	"lu" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "degradation_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode_id" uuid NOT NULL,
	"duree_minutes" integer DEFAULT 0,
	"raison" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "degradation_modes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"ressource" text NOT NULL,
	"actif" boolean DEFAULT false,
	"grace_mode" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dev_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"titre" text NOT NULL,
	"description" text DEFAULT '',
	"type" text DEFAULT 'feature',
	"statut" text DEFAULT 'backlog',
	"priorite" text DEFAULT 'normale',
	"agent_ia" text DEFAULT '',
	"analyse_llm" text DEFAULT '',
	"temps_estime" integer DEFAULT 0,
	"assigne_a" text DEFAULT '',
	"deadline" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forecast_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"annee_mois" text NOT NULL,
	"montant" real NOT NULL,
	"categorie" text DEFAULT '',
	"type" text DEFAULT 'recette',
	"source" text DEFAULT 'manuel',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_oauth_tokens_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governor_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" text NOT NULL,
	"budget_journalier" integer DEFAULT 100000,
	"budget_mensuel" integer DEFAULT 2000000,
	"alerte_seuil" integer DEFAULT 80,
	"blocage_seuil" integer DEFAULT 95,
	"actif" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governor_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" text NOT NULL,
	"pole_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0,
	"tokens_out" integer DEFAULT 0,
	"cout_usd" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "imap_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 993,
	"email" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "imap_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"sujet" text DEFAULT '',
	"expediteur" text DEFAULT '',
	"corps" text DEFAULT '',
	"lu" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "injection_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" text NOT NULL,
	"input" text NOT NULL,
	"flagged" boolean DEFAULT false,
	"raison" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keybindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"touche" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "keybindings_user_id_touche_unique" UNIQUE("user_id","touche")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"agent_id" uuid,
	"cle" text NOT NULL,
	"valeur" text NOT NULL,
	"type" text DEFAULT 'context',
	"ttl" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orchestrator_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pole_id" uuid,
	"titre" text NOT NULL,
	"agents" text DEFAULT '[]',
	"statut" text DEFAULT 'actif',
	"output" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member',
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_org_id_user_id_unique" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"slug" text NOT NULL,
	"emoji" text DEFAULT '🏢',
	"owner_id" text NOT NULL,
	"plan" text DEFAULT 'personal',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"hint" text DEFAULT '',
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_api_keys_user_id_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rapports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"titre" text NOT NULL,
	"contenu" text NOT NULL,
	"type" text DEFAULT 'weekly',
	"periode" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "risk_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" text NOT NULL,
	"pole_id" uuid,
	"action" text NOT NULL,
	"score" integer DEFAULT 0,
	"niveau" text DEFAULT 'faible',
	"fast_path" boolean DEFAULT false,
	"approuve" boolean DEFAULT false,
	"raison" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"nom" text NOT NULL,
	"contexte" text DEFAULT '',
	"filtre" text DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slo_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"module" text NOT NULL,
	"health_score" integer DEFAULT 100,
	"slo_target" real DEFAULT 99.9,
	"slo_current" real DEFAULT 100,
	"erreurs_24h" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staging_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"contenu" text NOT NULL,
	"score_mea" real DEFAULT 0,
	"statut" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" text NOT NULL,
	"stripe_session_id" text NOT NULL,
	"montant" integer DEFAULT 0,
	"devise" text DEFAULT 'eur',
	"statut" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_dag_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"nom" text NOT NULL,
	"description" text DEFAULT '',
	"agent_owner" text DEFAULT '',
	"dependances" text DEFAULT '[]',
	"statut" text DEFAULT 'pending',
	"criticite" text DEFAULT 'normale',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"nom" text NOT NULL,
	"email" text DEFAULT '',
	"role" text DEFAULT 'viewer',
	"poles" text DEFAULT '[]',
	"statut" text DEFAULT 'actif',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" uuid,
	"nom" text NOT NULL,
	"description" text DEFAULT '',
	"type" text DEFAULT 'autre',
	"contenu" text NOT NULL,
	"variables" text DEFAULT '[]',
	"public" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_llm_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"user_id" text NOT NULL,
	"tool_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_llm_configs_org_id_tool_id_unique" UNIQUE("org_id","tool_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "venture_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member',
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "venture_members_venture_id_user_id_unique" UNIQUE("venture_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ventures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"org_id" uuid,
	"nom" text NOT NULL,
	"description" text DEFAULT '',
	"emoji" text DEFAULT '🚀',
	"couleur" text DEFAULT '#6366f1',
	"type" text DEFAULT 'own',
	"statut" text DEFAULT 'actif',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gitpack_jobs" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "kb_articles" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "poles" ADD COLUMN "type" text DEFAULT 'custom';--> statement-breakpoint
ALTER TABLE "poles" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "veille_sources" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "org_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "abonnements" ADD CONSTRAINT "abonnements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_autonomy_rules" ADD CONSTRAINT "agent_autonomy_rules_agent_id_agent_definitions_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_feedback" ADD CONSTRAINT "agent_feedback_agent_id_agent_definitions_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agent_definitions_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_definitions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_scores" ADD CONSTRAINT "agent_scores_agent_id_agent_definitions_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brief_configs" ADD CONSTRAINT "brief_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "briefs" ADD CONSTRAINT "briefs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "degradation_episodes" ADD CONSTRAINT "degradation_episodes_mode_id_degradation_modes_id_fk" FOREIGN KEY ("mode_id") REFERENCES "public"."degradation_modes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "degradation_modes" ADD CONSTRAINT "degradation_modes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dev_tasks" ADD CONSTRAINT "dev_tasks_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dev_tasks" ADD CONSTRAINT "dev_tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "forecast_entries" ADD CONSTRAINT "forecast_entries_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governor_configs" ADD CONSTRAINT "governor_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governor_usage" ADD CONSTRAINT "governor_usage_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "governor_usage" ADD CONSTRAINT "governor_usage_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "imap_emails" ADD CONSTRAINT "imap_emails_config_id_imap_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."imap_configs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "injection_logs" ADD CONSTRAINT "injection_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_agent_id_agent_definitions_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_definitions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orchestrator_sessions" ADD CONSTRAINT "orchestrator_sessions_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_api_keys" ADD CONSTRAINT "provider_api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rapports" ADD CONSTRAINT "rapports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_logs" ADD CONSTRAINT "risk_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_logs" ADD CONSTRAINT "risk_logs_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "slo_entries" ADD CONSTRAINT "slo_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staging_proposals" ADD CONSTRAINT "staging_proposals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stripe_payments" ADD CONSTRAINT "stripe_payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_dag_items" ADD CONSTRAINT "task_dag_items_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "templates" ADD CONSTRAINT "templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tool_llm_configs" ADD CONSTRAINT "tool_llm_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "venture_members" ADD CONSTRAINT "venture_members_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ventures" ADD CONSTRAINT "ventures_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gitpack_jobs" ADD CONSTRAINT "gitpack_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "poles" ADD CONSTRAINT "poles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veille_sources" ADD CONSTRAINT "veille_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
