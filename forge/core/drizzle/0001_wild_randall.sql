CREATE TABLE IF NOT EXISTS "audit_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"nom" text NOT NULL,
	"type" text DEFAULT 'pdf',
	"contenu" text DEFAULT '',
	"analyse" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text DEFAULT '',
	"statut" text DEFAULT 'brouillon',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"montant" integer NOT NULL,
	"type" text NOT NULL,
	"categorie" text DEFAULT '',
	"date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"nom" text NOT NULL,
	"email" text DEFAULT '',
	"telephone" text DEFAULT '',
	"entreprise" text DEFAULT '',
	"statut" text DEFAULT 'prospect',
	"valeur" integer DEFAULT 0,
	"notes" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pole_id" uuid,
	"session_id" uuid,
	"nom" text NOT NULL,
	"type" text DEFAULT 'pdf',
	"contenu" text NOT NULL,
	"analyse" text DEFAULT '',
	"taille" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"nom" text DEFAULT '',
	"config" text DEFAULT '{}',
	"actif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"nom" text NOT NULL,
	"objectif" text DEFAULT '',
	"statut" text DEFAULT 'actif',
	"date_debut" timestamp DEFAULT now() NOT NULL,
	"date_fin" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sprint_id" uuid,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text DEFAULT '',
	"statut" text DEFAULT 'todo',
	"priorite" text DEFAULT 'normale',
	"assigne_a" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_documents" ADD CONSTRAINT "audit_documents_mission_id_audit_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."audit_missions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_missions" ADD CONSTRAINT "audit_missions_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sprints" ADD CONSTRAINT "sprints_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
