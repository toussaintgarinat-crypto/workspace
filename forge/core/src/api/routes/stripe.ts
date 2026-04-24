import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { abonnements, stripePayments } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { JWTPayload } from '../middleware/auth'

const PLANS = {
  free:       { prix: 0,    features: ['5 sessions/mois', '2 pôles', 'LLM local'] },
  starter:    { prix: 29,   features: ['100 sessions/mois', '5 pôles', 'Multi-LLM', 'KB'] },
  pro:        { prix: 99,   features: ['Illimité', 'Tous pôles', 'Agents avancés', 'API'] },
  enterprise: { prix: 299,  features: ['Illimité', 'SSO', 'SLA', 'Support dédié'] },
}

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/stripe/plans', async (c) => {
  return c.json(PLANS)
})

app.get('/stripe/abonnement', async (c) => {
  const orgId = c.req.header('X-Org-ID')
  if (!orgId) return c.json(null)
  const [abo] = await db.select().from(abonnements)
    .where(eq(abonnements.orgId, orgId)).limit(1)
  return c.json(abo ?? { plan: 'free', statut: 'actif' })
})

app.post('/stripe/checkout', zValidator('json', z.object({
  plan: z.enum(['starter', 'pro', 'enterprise']),
})), async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const { plan } = c.req.valid('json')
  const sessionId = `cs_${Date.now()}_${Math.random().toString(36).slice(2)}`
  if (orgId) {
    await db.insert(stripePayments).values({
      orgId, userId: user.sub,
      stripeSessionId: sessionId,
      montant: PLANS[plan].prix * 100,
      statut: 'pending',
    })
  }
  return c.json({ sessionId, checkoutUrl: `https://checkout.stripe.com/pay/${sessionId}` })
})

app.post('/stripe/webhook', async (c) => {
  const body = await c.req.json()
  if (body.type === 'checkout.session.completed') {
    const sessionId = body.data?.object?.id
    if (sessionId) {
      await db.update(stripePayments)
        .set({ statut: 'complete', completedAt: new Date() })
        .where(eq(stripePayments.stripeSessionId, sessionId))
    }
  }
  return c.json({ received: true })
})

app.get('/stripe/payments', async (c) => {
  const user = c.get('user')
  const orgId = c.req.header('X-Org-ID')
  const payments = await db.select().from(stripePayments)
    .where(eq(stripePayments.userId, user.sub))
    .orderBy(desc(stripePayments.createdAt))
  return c.json(payments)
})

export default app
