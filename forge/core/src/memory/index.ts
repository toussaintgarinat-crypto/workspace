import { QdrantClient } from '@qdrant/js-client-rest'

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
})

// Une collection par provider d'embedding
export const COLLECTIONS = {
  local:   { name: 'forge_local',   size: 384  },
  openai:  { name: 'forge_openai',  size: 1536 },
  gemini:  { name: 'forge_gemini',  size: 768  },
  mistral: { name: 'forge_mistral', size: 1024 },
} as const

export type EmbeddingProvider = keyof typeof COLLECTIONS

export async function initQdrant() {
  try {
    const { collections } = await qdrant.getCollections()
    const existing = new Set(collections.map(c => c.name))

    for (const { name, size } of Object.values(COLLECTIONS)) {
      if (!existing.has(name)) {
        await qdrant.createCollection(name, {
          vectors: { size, distance: 'Cosine' },
        })
        console.log(`[forge:memory] Collection "${name}" created (${size}-dim)`)
      }
    }

    console.log('[forge:memory] Qdrant connected')
  } catch (err) {
    console.warn('[forge:memory] Qdrant not available — RAG disabled:', err)
  }
}
