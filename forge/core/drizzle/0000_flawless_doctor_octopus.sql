CREATE TABLE IF NOT EXISTS "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blackboard_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid,
	"pole_nom" text NOT NULL,
	"pole_emoji" text DEFAULT '',
	"agent_nom" text NOT NULL,
	"type" text NOT NULL,
	"payload" text NOT NULL,
	"niveau" text DEFAULT 'N1',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decisions_n0" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid,
	"pole_nom" text NOT NULL,
	"agent_nom" text NOT NULL,
	"action" text NOT NULL,
	"niveau" text DEFAULT 'N0',
	"statut" text DEFAULT 'en_attente',
	"urgence" text DEFAULT 'normale',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kill_switches" (
	"pole_id" uuid PRIMARY KEY NOT NULL,
	"en_pause" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"provider" text DEFAULT 'ollama',
	"base_url" text DEFAULT '',
	"api_key" text DEFAULT '',
	"model" text DEFAULT 'llama3.2',
	"max_tokens" integer DEFAULT 2048,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "llm_configs_pole_id_unique" UNIQUE("pole_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pole_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"nom" text NOT NULL,
	"avatar_emoji" text DEFAULT '👤',
	"role" text DEFAULT 'member',
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pole_members_pole_id_user_id_unique" UNIQUE("pole_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"description" text DEFAULT '',
	"emoji" text DEFAULT '🌍',
	"couleur" text DEFAULT '#6366f1',
	"owner_id" text NOT NULL,
	"venture_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'New conversation' NOT NULL,
	"pole_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nom" text NOT NULL,
	"avatar_emoji" text DEFAULT '👤',
	"password_hash" text NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blackboard_events" ADD CONSTRAINT "blackboard_events_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "decisions_n0" ADD CONSTRAINT "decisions_n0_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kill_switches" ADD CONSTRAINT "kill_switches_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_configs" ADD CONSTRAINT "llm_configs_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pole_members" ADD CONSTRAINT "pole_members_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
