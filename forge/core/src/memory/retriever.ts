import { qdrant } from './index'
import { embedOne, resolveProvider } from './embedder'
import type { EmbeddingProvider } from './index'

interface RetrieveOptions {
  limit?:    number
  minScore?: number
  poleId?:   string
  provider?: EmbeddingProvider
}

// Recherche sémantique dans Qdrant, provider résolu automatiquement
export async function getContext(question: string, _sessionId: string, opts: RetrieveOptions = {}): Promise<string> {
  try {
    const { limit = 5, minScore = 0.65, poleId, provider: preferredProvider } = opts
    const provider = resolveProvider(preferredProvider)

    const { vector, collection } = await embedOne(question, provider)

    const filter = poleId
      ? { must: [{ key: 'pole_id', match: { value: poleId } }] }
      : undefined

    const results = await qdrant.search(collection, {
      vector,
      limit,
      with_payload: true,
      filter,
    })

    const relevant = results
      .filter(r => r.score > minScore)
      .sort((a, b) => {
        const scoreDiff = (b.score - a.score) * 0.7
        const tA = new Date((a.payload?.timestamp as string) || 0).getTime()
        const tB = new Date((b.payload?.timestamp as string) || 0).getTime()
        const timeDiff = (tB - tA) / 1e12 * 0.3
        return scoreDiff + timeDiff
      })

    if (!relevant.length) return ''

    return relevant
      .map(r => `[${r.payload?.title || r.payload?.source_type || 'doc'}]\n${r.payload?.text}`)
      .join('\n\n---\n\n')

  } catch (e) {
    console.warn('[forge:retriever] RAG failed:', e)
    return ''
  }
}
