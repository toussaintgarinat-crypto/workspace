CREATE TABLE IF NOT EXISTS "pole_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pole_id" uuid NOT NULL,
	"tool_key" text NOT NULL,
	"enabled" boolean DEFAULT true,
	"ordre" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pole_tools_pole_id_tool_key_unique" UNIQUE("pole_id","tool_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"icon" text DEFAULT '🔧',
	"description" text DEFAULT '',
	"commun" boolean DEFAULT true,
	"poles_dedies" text DEFAULT '[]',
	"ordre" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_catalog_key_unique" UNIQUE("key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pole_tools" ADD CONSTRAINT "pole_tools_pole_id_poles_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
