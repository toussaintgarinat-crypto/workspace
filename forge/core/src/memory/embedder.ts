import { embed } from 'ai'
import type { EmbeddingModel } from 'ai'
import { openai }   from '@ai-sdk/openai'
import { google }   from '@ai-sdk/google'
import { mistral }  from '@ai-sdk/mistral'
import { COLLECTIONS } from './index'
import type { EmbeddingProvider } from './index'

const ML_URL = process.env.ML_MODULE_URL || 'http://localhost:8001'

// ── Providers ────────────────────────────────────────────────

async function embedLocal(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${ML_URL}/embeddings/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
  })
  if (!res.ok) throw new Error(`ML module error: ${res.status}`)
  const data = await res.json() as { embeddings: number[][] }
  return data.embeddings
}

async function embedOpenAI(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: openai.embedding('text-embedding-3-small') as EmbeddingModel<string>, value: text })
  return embedding
}

async function embedGemini(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: google.textEmbeddingModel('text-embedding-004') as unknown as EmbeddingModel<string>, value: text })
  return embedding
}

async function embedMistral(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: mistral.textEmbeddingModel('mistral-embed') as unknown as EmbeddingModel<string>, value: text })
  return embedding
}

// ── Disponibilité ────────────────────────────────────────────

export const PROVIDER_KEYS: Record<Exclude<EmbeddingProvider, 'local'>, string> = {
  openai:  'OPENAI_API_KEY',
  gemini:  'GEMINI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
}

function isAvailable(provider: EmbeddingProvider): boolean {
  if (provider === 'local') return true
  return !!process.env[PROVIDER_KEYS[provider]]
}

export function availableProviders(): EmbeddingProvider[] {
  return (Object.keys(COLLECTIONS) as EmbeddingProvider[]).filter(isAvailable)
}

// Résout le meilleur provider : préféré si dispo, sinon fallback local
export function resolveProvider(preferred?: EmbeddingProvider): EmbeddingProvider {
  if (preferred && isAvailable(preferred)) return preferred
  // Priorité : openai > gemini > mistral > local
  for (const p of ['openai', 'gemini', 'mistral', 'local'] as EmbeddingProvider[]) {
    if (isAvailable(p)) return p
  }
  return 'local'
}

// ── Embed ────────────────────────────────────────────────────

export interface EmbedResult {
  vector:     number[]
  provider:   EmbeddingProvider
  collection: string
}

export async function embedOne(text: string, provider: EmbeddingProvider): Promise<EmbedResult> {
  let vector: number[]

  switch (provider) {
    case 'openai':  vector = await embedOpenAI(text);  break
    case 'gemini':  vector = await embedGemini(text);  break
    case 'mistral': vector = await embedMistral(text); break
    default: {
      const [v] = await embedLocal([text])
      vector = v
    }
  }

  return { vector, provider, collection: COLLECTIONS[provider].name }
}

// Embed en batch — local en une seule requête, API en parallèle
async function embedBatchSingle(texts: string[], provider: EmbeddingProvider): Promise<number[][]> {
  if (provider === 'local') return embedLocal(texts)
  const fns = { openai: embedOpenAI, gemini: embedGemini, mistral: embedMistral }
  return Promise.all(texts.map(fns[provider]))
}

// Ingestion : embed avec TOUS les providers disponibles
export async function embedBoth(texts: string[]): Promise<Map<EmbeddingProvider, number[][]>> {
  const result = new Map<EmbeddingProvider, number[][]>()

  await Promise.allSettled(
    availableProviders().map(async (provider) => {
      try {
        result.set(provider, await embedBatchSingle(texts, provider))
      } catch (e) {
        console.warn(`[forge:embedder] ${provider} embedding failed:`, e)
      }
    })
  )

  return result
}
