CREATE TABLE IF NOT EXISTS "agent_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pole_id" uuid,
	"nom" text NOT NULL,
	"description" text DEFAULT '',
	"instructions" text DEFAULT '',
	"niveau" text DEFAULT 'medium',
	"statut" text DEFAULT 'draft',
	"llm_preset" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "factures_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pole_id" uuid,
	"numero" text NOT NULL,
	"type" text DEFAULT 'facture',
	"client_nom" text NOT NULL,
	"client_email" text DEFAULT '',
	"client_adresse" text DEFAULT '',
	"lignes" text DEFAULT '[]',
	"total_ht" real DEFAULT 0,
	"total_tva" real DEFAULT 0,
	"total_ttc" real DEFAULT 0,
	"tva_taux" real DEFAULT 20,
	"statut" text DEFAULT 'brouillon',
	"notes" text DEFAULT '',
	"conditions" text DEFAULT 'Paiement à 30 jours',
	"date_emission" text DEFAULT '',
	"date_echeance" text DEFAULT '',
	"date_paiement" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kb_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"titre" text NOT NULL,
	"contenu" text DEFAULT '',
	"tags" text DEFAULT '[]',
	"is_pinned" boolean DEFAULT false,
	"is_public" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "key_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"okr_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"valeur_cible" real DEFAULT 100,
	"valeur_actuelle" real DEFAULT 0,
	"unite" text DEFAULT '%',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "okrs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pole_id" uuid,
	"titre" text NOT NULL,
	"description" text DEFAULT '',
	"statut" text DEFAULT 'actif',
	"periode" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "veille_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_id" uuid,
	"titre" text NOT NULL,
	"url" text NOT NULL,
	"resume" text DEFAULT '',
	"lu" boolean DEFAULT false,
	"published_at" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "veille_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"nom" text NOT NULL,
	"url" text NOT NULL,
	"type" text DEFAULT 'rss',
	"enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"nom" text NOT NULL,
	"url" text NOT NULL,
	"events" text DEFAULT '[]',
	"enabled" boolean DEFAULT true,
	"secret" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "keycloak_sub" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_definitions" ADD CONSTRAINT "agent_definitions_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "factures_docs" ADD CONSTRAINT "factures_docs_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "key_results" ADD CONSTRAINT "key_results_okr_id_okrs_id_fk" FOREIGN KEY ("okr_id") REFERENCES "public"."okrs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "okrs" ADD CONSTRAINT "okrs_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veille_articles" ADD CONSTRAINT "veille_articles_source_id_veille_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."veille_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_keycloak_sub_unique" UNIQUE("keycloak_sub");