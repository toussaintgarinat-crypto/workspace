import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { facturesDocs } from '../../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

const LigneSchema = z.object({
  description:   z.string(),
  quantite:      z.number().default(1),
  prixUnitaire:  z.number().default(0),
  tva:           z.number().default(20),
})

const DocSchema = z.object({
  type:          z.enum(['facture', 'devis']).default('facture'),
  clientNom:     z.string().min(1),
  clientEmail:   z.string().optional(),
  clientAdresse: z.string().optional(),
  lignes:        z.array(LigneSchema).default([]),
  tvaTaux:       z.number().default(20),
  notes:         z.string().optional(),
  conditions:    z.string().optional(),
  dateEmission:  z.string().optional(),
  dateEcheance:  z.string().optional(),
  poleId:        z.string().uuid().optional(),
})

// Numérotation auto
async function nextNumero(type: 'facture' | 'devis', userId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = type === 'devis' ? 'DEVIS' : 'FACT'
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(facturesDocs)
    .where(and(eq(facturesDocs.userId, userId), eq(facturesDocs.type, type)))
  const n = (Number(result[0]?.count) || 0) + 1
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`
}

function calcTotaux(lignes: any[], tvaTaux: number) {
  const totalHt  = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)
  const totalTva = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire * ((l.tva ?? tvaTaux) / 100), 0)
  return { totalHt: Math.round(totalHt * 100) / 100, totalTva: Math.round(totalTva * 100) / 100, totalTtc: Math.round((totalHt + totalTva) * 100) / 100 }
}

// List
app.get('/facturation', async (c) => {
  const user = c.get('user')
  const type = c.req.query('type')
  const where = type
    ? and(eq(facturesDocs.userId, user.sub), eq(facturesDocs.type, type as any))
    : eq(facturesDocs.userId, user.sub)
  const docs = await db.select().from(facturesDocs).where(where).orderBy(desc(facturesDocs.createdAt))
  const totals = docs.reduce((acc, d) => ({
    caTotal:     acc.caTotal + (d.statut === 'payée' ? (d.totalTtc ?? 0) : 0),
    caEnAttente: acc.caEnAttente + (['envoyée', 'envoyé'].includes(d.statut ?? '') ? (d.totalTtc ?? 0) : 0),
    nbFactures:  acc.nbFactures + (d.type === 'facture' ? 1 : 0),
    nbDevis:     acc.nbDevis + (d.type === 'devis' ? 1 : 0),
  }), { caTotal: 0, caEnAttente: 0, nbFactures: 0, nbDevis: 0 })
  return c.json({ items: docs, stats: totals })
})

// Get one
app.get('/facturation/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [doc] = await db.select().from(facturesDocs).where(and(eq(facturesDocs.id, id), eq(facturesDocs.userId, user.sub)))
  if (!doc) return c.json({ error: 'Not found' }, 404)
  return c.json(doc)
})

// Create
app.post('/facturation', zValidator('json', DocSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const numero = await nextNumero(body.type, user.sub)
  const lignesArr = body.lignes.map(l => ({ ...l }))
  const { totalHt, totalTva, totalTtc } = calcTotaux(lignesArr, body.tvaTaux ?? 20)
  const [doc] = await db.insert(facturesDocs).values({
    userId:        user.sub,
    poleId:        body.poleId ?? null,
    numero,
    type:          body.type,
    clientNom:     body.clientNom,
    clientEmail:   body.clientEmail ?? '',
    clientAdresse: body.clientAdresse ?? '',
    lignes:        JSON.stringify(lignesArr),
    totalHt,
    totalTva,
    totalTtc,
    tvaRaux:       body.tvaTaux,
    notes:         body.notes ?? '',
    conditions:    body.conditions ?? 'Paiement à 30 jours',
    dateEmission:  body.dateEmission ?? '',
    dateEcheance:  body.dateEcheance ?? '',
    statut:        'brouillon',
  }).returning()
  return c.json({ ...doc, lignes: lignesArr }, 201)
})

// Update
app.patch('/facturation/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json()
  if (body.lignes) {
    const { totalHt, totalTva, totalTtc } = calcTotaux(body.lignes, body.tvaTaux ?? 20)
    body.totalHt = totalHt; body.totalTva = totalTva; body.totalTtc = totalTtc
    body.lignes = JSON.stringify(body.lignes)
  }
  const [doc] = await db.update(facturesDocs).set({ ...body, updatedAt: new Date() })
    .where(and(eq(facturesDocs.id, id), eq(facturesDocs.userId, user.sub))).returning()
  return c.json(doc)
})

// Delete
app.delete('/facturation/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(facturesDocs).where(and(eq(facturesDocs.id, id), eq(facturesDocs.userId, user.sub)))
  return c.json({ ok: true })
})

// Transformer devis → facture
app.post('/facturation/:id/transformer', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [devis] = await db.select().from(facturesDocs).where(and(eq(facturesDocs.id, id), eq(facturesDocs.userId, user.sub)))
  if (!devis || devis.type !== 'devis') return c.json({ error: 'Not a devis' }, 400)
  const numero = await nextNumero('facture', user.sub)
  const lignes = JSON.parse(devis.lignes ?? '[]')
  const { totalHt, totalTva, totalTtc } = calcTotaux(lignes, devis.tvaRaux ?? 20)
  const [facture] = await db.insert(facturesDocs).values({
    ...devis, id: undefined as any, numero, type: 'facture', statut: 'brouillon', totalHt, totalTva, totalTtc
  }).returning()
  // Mark devis as transformed
  await db.update(facturesDocs).set({ statut: 'transformé', updatedAt: new Date() }).where(eq(facturesDocs.id, id))
  return c.json(facture, 201)
})

export default app
