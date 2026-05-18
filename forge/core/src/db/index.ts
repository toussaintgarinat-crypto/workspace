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
  `)
  console.log('[forge:db] migrations OK')
}
