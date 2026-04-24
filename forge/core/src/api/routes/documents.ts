import { Hono } from 'hono'
import { db } from '../../db'
import { documents } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { generateText } from 'ai'
import { getModel } from '../../llm'
import { ingest, deleteBySource } from '../../memory/ingestor'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

// Upload + analyse d'un document (texte extrait côté client)
app.post('/documents/upload', async (c) => {
  const user = c.get('user')
  const body = await c.req.json()
  const { nom, contenu, type, poleId, sessionId } = body

  if (!nom || !contenu) return c.json({ error: 'nom and contenu required' }, 400)

  // Analyse LLM du document
  let analyse = ''
  try {
    const model = getModel()
    const result = await generateText({
      model,
      messages: [{
        role: 'user',
        content: `Analyse ce document et donne un résumé structuré (points clés, risques, actions recommandées) :\n\n${contenu.slice(0, 8000)}`
      }],
      maxTokens: 1024,
    })
    analyse = result.text
  } catch (e) {
    analyse = 'Analyse non disponible'
  }

  const [doc] = await db.insert(documents).values({
    userId: user.sub,
    nom,
    type: type ?? 'pdf',
    contenu,
    analyse,
    taille: contenu.length,
    poleId: poleId || null,
    sessionId: sessionId || null,
  }).returning()

  // Ingestion async dans Qdrant
  ingest({
    text:       contenu,
    sourceId:   doc.id,
    sourceType: 'document',
    userId:     user.sub,
    poleId:     poleId || undefined,
    title:      nom,
  }).catch(() => {})

  return c.json(doc, 201)
})

app.get('/documents', async (c) => {
  const user = c.get('user')
  const list = await db.select({
    id: documents.id,
    nom: documents.nom,
    type: documents.type,
    analyse: documents.analyse,
    taille: documents.taille,
    poleId: documents.poleId,
    createdAt: documents.createdAt,
  }).from(documents)
    .where(eq(documents.userId, user.sub))
    .orderBy(desc(documents.createdAt))
  return c.json(list)
})

app.get('/documents/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [doc] = await db.select().from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, user.sub)))
  if (!doc) return c.json({ error: 'Not found' }, 404)
  return c.json(doc)
})

app.delete('/documents/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, user.sub)))
  deleteBySource(id).catch(() => {})
  return c.json({ ok: true })
})

export default app
