-- Sprint 103: Audit AI Report Generator
ALTER TABLE "rapports" ADD COLUMN IF NOT EXISTS "mission_id" uuid REFERENCES "audit_missions"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "audit_findings" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "mission_id"  uuid NOT NULL REFERENCES "audit_missions"("id") ON DELETE CASCADE,
  "user_id"     text NOT NULL,
  "categorie"   text DEFAULT '',
  "severite"    text DEFAULT 'faible',
  "description" text NOT NULL,
  "source"      text DEFAULT '',
  "created_at"  timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_recommendations" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "mission_id" uuid NOT NULL REFERENCES "audit_missions"("id") ON DELETE CASCADE,
  "user_id"    text NOT NULL,
  "priorite"   text DEFAULT 'moyenne',
  "action"     text NOT NULL,
  "statut"     text DEFAULT 'ouvert',
  "created_at" timestamp DEFAULT now() NOT NULL
);
