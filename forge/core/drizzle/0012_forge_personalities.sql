-- Sprint 105b: Forge Personalities — catalogue éditable de personnalités pour les agents

CREATE TABLE IF NOT EXISTS "forge_personalities" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "label"         text NOT NULL,
  "emoji"         text DEFAULT '🤖',
  "description"   text DEFAULT '',
  "system_prompt" text DEFAULT '',
  "is_builtin"    integer DEFAULT 0,
  "created_at"    timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "agent_definitions"
  ADD COLUMN IF NOT EXISTS "personality_id" uuid REFERENCES "forge_personalities"("id") ON DELETE SET NULL;
