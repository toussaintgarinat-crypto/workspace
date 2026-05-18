-- Sprint 60: Pipeline Templates + DAG node positions
ALTER TABLE "task_dag_items" ADD COLUMN IF NOT EXISTS "node_type" text DEFAULT 'agent';
ALTER TABLE "task_dag_items" ADD COLUMN IF NOT EXISTS "pos_x" real DEFAULT 0;
ALTER TABLE "task_dag_items" ADD COLUMN IF NOT EXISTS "pos_y" real DEFAULT 0;
ALTER TABLE "task_dag_items" ADD COLUMN IF NOT EXISTS "prompt_text" text DEFAULT '';

CREATE TABLE IF NOT EXISTS "pipeline_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text,
  "nom" text NOT NULL,
  "description" text DEFAULT '',
  "icon" text DEFAULT '🔄',
  "categorie" text DEFAULT '',
  "nodes" text DEFAULT '[]',
  "edges" text DEFAULT '[]',
  "is_public" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
