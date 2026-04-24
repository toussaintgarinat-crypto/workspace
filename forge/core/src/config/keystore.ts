import { db } from '@/db'
import { providerApiKeys } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { decrypt } from './crypto'

export type Provider = 'openai' | 'anthropic' | 'gemini' | 'mistral' | 'groq' | 'ollama'

// Correspondance provider → variable d'environnement
const ENV_MAP: Record<Provider, string> = {
  openai:    'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini:    'GEMINI_API_KEY',
  mistral:   'MISTRAL_API_KEY',
  groq:      'GROQ_API_KEY',
  ollama:    'OLLAMA_BASE_URL',
}

// Cache en mémoire (durée de vie du process) pour éviter des requêtes DB répétées
const cache = new Map<string, { value: string; ts: number }>()
const TTL_MS = 60_000 // 1 minute

function cacheKey(userId: string, provider: string) { return `${userId}:${provider}` }

// Résout une clé API : DB d'abord, puis env vars
export async function resolveKey(userId: string, provider: Provider): Promise<string | null> {
  const ck = cacheKey(userId, provider)
  const cached = cache.get(ck)
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.value

  // Cherche en DB
  const [row] = await db.select()
    .from(providerApiKeys)
    .where(and(eq(providerApiKeys.userId, userId), eq(providerApiKeys.provider, provider)))

  if (row?.encryptedKey) {
    try {
      const value = await decrypt(row.encryptedKey)
      cache.set(ck, { value, ts: Date.now() })
      return value
    } catch { /* clé corrompue, on tombe sur env */ }
  }

  // Fallback sur env vars
  const envValue = process.env[ENV_MAP[provider]] ?? null
  if (envValue) cache.set(ck, { value: envValue, ts: Date.now() })
  return envValue
}

// Invalide le cache pour un user/provider (après un update)
export function invalidateCache(userId: string, provider: string) {
  cache.delete(cacheKey(userId, provider))
}
