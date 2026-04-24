CREATE TABLE IF NOT EXISTS "contrats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"titre" text NOT NULL,
	"type" text DEFAULT 'Autre',
	"parties" text DEFAULT '',
	"contenu" text DEFAULT '',
	"valeur" integer DEFAULT 0,
	"statut" text DEFAULT 'brouillon',
	"date_debut" text DEFAULT '',
	"date_fin" text DEFAULT '',
	"notes" text DEFAULT '',
	"signe_par" text,
	"signe_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gitpack_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"github_url" text NOT NULL,
	"platform" text DEFAULT 'macos',
	"statut" text DEFAULT 'pending',
	"language" text,
	"framework" text,
	"logs" text DEFAULT '[]',
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"titre" text NOT NULL,
	"description" text DEFAULT '',
	"severite" text DEFAULT 'moyenne',
	"statut" text DEFAULT 'ouvert',
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contrats" ADD CONSTRAINT "contrats_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
