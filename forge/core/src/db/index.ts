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
  } catch (err) {
    console.error('[forge:db] Connection failed:', err)
    process.exit(1)
  }
}
