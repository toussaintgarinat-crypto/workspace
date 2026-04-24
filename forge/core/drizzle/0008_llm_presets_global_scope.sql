ALTER TABLE "llm_presets" DROP CONSTRAINT IF EXISTS "llm_presets_scope_type_check";
ALTER TABLE "llm_presets" ADD CONSTRAINT "llm_presets_scope_type_check"
  CHECK (scope_type IN ('venture', 'pole', 'tool', 'agent', 'global'));
