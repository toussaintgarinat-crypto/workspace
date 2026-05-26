-- Sprint 114: position column for drag-drop ordering
ALTER TABLE "forge_personalities" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0;
