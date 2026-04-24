-- Migration: LLM Presets hiérarchiques (venture → pole → tool → agent)
-- Remplace llm_configs (pole-only) et tool_llm_configs (org-only)

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

-- Migrer les configs pole existantes vers llm_presets
INSERT INTO llm_presets (scope_type, scope_id, venture_id, provider, base_url, api_key, model, max_tokens, updated_at, updated_by)
SELECT
  'pole',
  lc.pole_id::TEXT,
  p.venture_id::UUID,
  lc.provider,
  lc.base_url,
  lc.api_key,
  lc.model,
  lc.max_tokens,
  lc.updated_at,
  lc.updated_by
FROM llm_configs lc
JOIN poles p ON p.id = lc.pole_id
ON CONFLICT (scope_type, scope_id) DO NOTHING;

-- Ajouter venture_id à governor_usage pour agrégation coûts par venture
ALTER TABLE governor_usage
  ADD COLUMN IF NOT EXISTS venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL;

-- Rétro-remplir venture_id dans governor_usage depuis poleId
UPDATE governor_usage gu
SET venture_id = p.venture_id::UUID
FROM poles p
WHERE p.id = gu.pole_id
  AND p.venture_id IS NOT NULL
  AND gu.venture_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_llm_presets_venture ON llm_presets (venture_id);
CREATE INDEX IF NOT EXISTS idx_governor_usage_venture ON governor_usage (venture_id);
