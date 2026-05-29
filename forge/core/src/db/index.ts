import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://forge:forge@localhost:5432/forge',
})

export const db = drizzle(pool, { schema })

export async function initDb() {
  try {
    await pool.query('SELECT 1')
    console.log('[forge:db] PostgreSQL connected')
    await runMigrations()
  } catch (err) {
    console.error('[forge:db] Connection failed:', err)
    process.exit(1)
  }
}

// DDL idempotents — IF NOT EXISTS garantit la sécurité au redémarrage
async function runMigrations() {
  await pool.query(`
    -- S60: positions + type nœud DAG
    ALTER TABLE task_dag_items ADD COLUMN IF NOT EXISTS node_type   text    DEFAULT 'agent';
    ALTER TABLE task_dag_items ADD COLUMN IF NOT EXISTS pos_x       real    DEFAULT 0;
    ALTER TABLE task_dag_items ADD COLUMN IF NOT EXISTS pos_y       real    DEFAULT 0;
    ALTER TABLE task_dag_items ADD COLUMN IF NOT EXISTS prompt_text text    DEFAULT '';

    -- S60: pipeline templates
    CREATE TABLE IF NOT EXISTS pipeline_templates (
      id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     text,
      nom         text      NOT NULL,
      description text      DEFAULT '',
      icon        text      DEFAULT '🔄',
      categorie   text      DEFAULT '',
      nodes       text      DEFAULT '[]',
      edges       text      DEFAULT '[]',
      is_public   boolean   DEFAULT false,
      created_at  timestamp DEFAULT now() NOT NULL,
      updated_at  timestamp DEFAULT now() NOT NULL
    );

    -- S103: audit report generator
    ALTER TABLE rapports ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES audit_missions(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS audit_findings (
      id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      mission_id  uuid      NOT NULL REFERENCES audit_missions(id) ON DELETE CASCADE,
      user_id     text      NOT NULL,
      categorie   text      DEFAULT '',
      severite    text      DEFAULT 'faible',
      description text      NOT NULL,
      source      text      DEFAULT '',
      created_at  timestamp DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_recommendations (
      id         uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      mission_id uuid      NOT NULL REFERENCES audit_missions(id) ON DELETE CASCADE,
      user_id    text      NOT NULL,
      priorite   text      DEFAULT 'moyenne',
      action     text      NOT NULL,
      statut     text      DEFAULT 'ouvert',
      created_at timestamp DEFAULT now() NOT NULL
    );

    -- S105b: personnalités Forge agents
    CREATE TABLE IF NOT EXISTS forge_personalities (
      id            uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      label         text      NOT NULL,
      emoji         text      DEFAULT '🤖',
      description   text      DEFAULT '',
      system_prompt text      DEFAULT '',
      is_builtin    integer   DEFAULT 0,
      created_at    timestamp DEFAULT now() NOT NULL
    );
    ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS personality_id uuid REFERENCES forge_personalities(id) ON DELETE SET NULL;

    -- S104: parc serveurs auditeur + instances déployées client
    CREATE TABLE IF NOT EXISTS managed_servers (
      id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     text      NOT NULL,
      label       text      NOT NULL,
      ip          text      NOT NULL,
      ssh_key     text      NOT NULL,
      ssh_user    text      DEFAULT 'root',
      region      text      DEFAULT '',
      status      text      DEFAULT 'libre',
      instance_id uuid,
      created_at  timestamp DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deployed_instances (
      id                   uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
      mission_id           uuid      NOT NULL REFERENCES audit_missions(id) ON DELETE CASCADE,
      user_id              text      NOT NULL,
      server_ip            text      NOT NULL,
      ssh_key              text      NOT NULL,
      ssh_user             text      DEFAULT 'root',
      domain               text      DEFAULT '',
      domain_mode          text      DEFAULT 'manual',
      status               text      DEFAULT 'deploying',
      admin_email          text      NOT NULL,
      admin_password_hash  text      NOT NULL,
      notes                text      DEFAULT '',
      deployed_at          timestamp,
      created_at           timestamp DEFAULT now() NOT NULL
    );

    -- S124: progression persistée du déploiement (découplé de la connexion SSE)
    ALTER TABLE deployed_instances ADD COLUMN IF NOT EXISTS progress_step       integer   DEFAULT 0;
    ALTER TABLE deployed_instances ADD COLUMN IF NOT EXISTS progress_total      integer   DEFAULT 6;
    ALTER TABLE deployed_instances ADD COLUMN IF NOT EXISTS progress_msg        text      DEFAULT '';
    ALTER TABLE deployed_instances ADD COLUMN IF NOT EXISTS progress_updated_at timestamp;
  `)
  console.log('[forge:db] migrations OK')
}
