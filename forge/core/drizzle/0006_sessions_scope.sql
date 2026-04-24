ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "venture_id" uuid REFERENCES "ventures"("id") ON DELETE SET NULL;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'user' CHECK ("scope" IN ('user', 'pole', 'venture'));
