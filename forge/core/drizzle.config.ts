import type { Config } from 'drizzle-kit'

export default {
  schema:    './src/db/schema.ts',
  out:       './drizzle',
  dialect:   'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://forge:forge@localhost:5432/forge',
  },
} satisfies Config
