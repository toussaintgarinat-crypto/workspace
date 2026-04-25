import { v4 as uuidv4 } from 'uuid'
import { qdrant, COLLECTIONS } from './index'
import { embedBoth } from './embedder'

const CHUNK_SIZE    = 512
const CHUNK_OVERLAP = 64

// Découpe un texte en chunks avec overlap
function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + CHUNK_SIZE))
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks.filter(c => c.trim().length > 20)
}

export interface IngestPayload {
  text:        string
  sourceId:    string   // id de l'entité source (article KB, document, etc.)
  sourceType:  string   // 'kb_article' | 'document' | 'sprint' | ...
  userId:      string
  poleId?:     string
  title?:      string
}

// Ingère un document dans Qdrant avec les deux providers disponibles
export async function ingest(payload: IngestPayload): Promise<Record<string, number>> {
  const chunks   = chunkText(payload.text)
  if (!chunks.length) return { local: 0, openai: 0 }

  const vectors  = await embedBoth(chunks)
  const counts: Record<string, number> = { local: 0, openai: 0, gemini: 0, mistral: 0 }
  const timestamp = new Date().toISOString()

  for (const [provider, vecs] of vectors) {
    const collection = COLLECTIONS[provider].name
    const points = chunks.map((chunk, i) => ({
      id:      uuidv4(),
      vector:  vecs[i],
      payload: {
        text:        chunk,
        source_id:   payload.sourceId,
        source_type: payload.sourceType,
        user_id:     payload.userId,
        pole_id:     payload.poleId ?? null,
        title:       payload.title ?? '',
        timestamp,
        provider,
      },
    }))

    try {
      await qdrant.upsert(collection, { points })
      counts[provider] = points.length
    } catch (e) {
      console.warn(`[forge:ingestor] Upsert failed (${collection}):`, e)
    }
  }

  console.log(`[forge:ingestor] "${payload.title}" — local:${counts.local} openai:${counts.openai} chunks`)
  return counts
}

// Supprime tous les vecteurs liés à une source (avant ré-ingestion ou suppression)
export async function deleteBySource(sourceId: string): Promise<void> {
  for (const { name } of Object.values(COLLECTIONS)) {
    try {
      await qdrant.delete(name, {
        filter: { must: [{ key: 'source_id', match: { value: sourceId } }] },
      })
    } catch { /* silencieux si collection vide */ }
  }
}
