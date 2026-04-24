-- Ensure table exists for fresh installs (was manually applied outside drizzle journal)
CREATE TABLE IF NOT EXISTS llm_presets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type     TEXT NOT NULL CHECK (scope_type IN ('venture', 'pole', 'tool', 'agent')),
  scope_id       TEXT NOT NULL,
  venture_id     UUID REFERENCES ventures(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL DEFAULT 'ollama',
  base_url       TEXT DEFAULT '',
  api_key        TEXT DEFAULT '',
  model          TEXT NOT NULL DEFAULT 'llama3.2',
  max_tokens     INTEGER DEFAULT 2048,
  budget_daily   REAL,
  budget_monthly REAL,
  updated_at     TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_by     TEXT,
  UNIQUE (scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_llm_presets_venture ON llm_presets (venture_id);

ALTER TABLE "llm_presets" DROP CONSTRAINT IF EXISTS "llm_presets_scope_type_check";
ALTER TABLE "llm_presets" ADD CONSTRAINT "llm_presets_scope_type_check"
  CHECK (scope_type IN ('venture', 'pole', 'tool', 'agent', 'global'));
