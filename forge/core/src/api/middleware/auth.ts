import { createMiddleware } from 'hono/factory'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { db } from '@/db'
import { users, organizations, organizationMembers } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

const KEYCLOAK_URL   = process.env.KEYCLOAK_URL   || 'http://localhost:8080'
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'forge'

const JWKS_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`

// On accepte les deux issuers : interne Docker (keycloak:8080) et externe (localhost:8080)
const ISSUERS = [
  `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
  `http://localhost:8080/realms/${KEYCLOAK_REALM}`,
  `http://127.0.0.1:8080/realms/${KEYCLOAK_REALM}`,
]

const JWKS = createRemoteJWKSet(new URL(JWKS_URL))

export interface JWTPayload {
  sub:         string
  nom:         string
  avatarEmoji: string
  orgId:       string | null
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const token = auth.slice(7)
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUERS })

    const keycloakSub = payload.sub as string

    // Récupère ou provisionne l'utilisateur Forge
    let [user] = await db.select().from(users).where(eq(users.keycloakSub, keycloakSub))

    if (!user) {
      const nom         = (payload['nom'] as string)
                       || (payload['preferred_username'] as string)
                       || (payload['name'] as string)
                       || 'Utilisateur'
      const email       = (payload['email'] as string) || `${keycloakSub}@forge.local`
      const avatarEmoji = (payload['avatarEmoji'] as string) || '👤'

      const [byEmail] = await db.select().from(users).where(eq(users.email, email))
      if (byEmail) {
        ;[user] = await db.update(users)
          .set({ keycloakSub })
          .where(eq(users.id, byEmail.id))
          .returning()
      } else {
        ;[user] = await db.insert(users).values({ email, nom, avatarEmoji, keycloakSub }).returning()
      }
    }

    // Auto-création de l'organisation personnelle au premier login
    const existingOrgs = await db.select().from(organizations)
      .where(eq(organizations.ownerId, user.id))

    if (!existingOrgs.length) {
      const slug = `${user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`
      const [org] = await db.insert(organizations).values({
        nom:     user.nom,
        slug,
        emoji:   '🏠',
        ownerId: user.id,
        plan:    'personal',
      }).returning()

      await db.insert(organizationMembers).values({
        orgId:  org.id,
        userId: user.id,
        role:   'owner',
      })
    }

    // Résolution de l'org active : header X-Org-ID → org personnelle
    const requestedOrgId = c.req.header('X-Org-ID')
    let activeOrgId: string | null = null

    if (requestedOrgId) {
      const [membership] = await db.select().from(organizationMembers)
        .where(and(
          eq(organizationMembers.orgId, requestedOrgId),
          eq(organizationMembers.userId, user.id),
        ))
      if (membership) activeOrgId = requestedOrgId
    }

    if (!activeOrgId) {
      const [defaultOrg] = await db.select().from(organizations)
        .where(eq(organizations.ownerId, user.id))
        .limit(1)
      activeOrgId = defaultOrg?.id ?? null
    }

    c.set('user', {
      sub:         user.id,
      nom:         user.nom,
      avatarEmoji: user.avatarEmoji,
      orgId:       activeOrgId,
    })

    await next()
  } catch (err: any) {
    console.error('[forge:auth] Failed:', err?.message || err?.code || String(err))
    return c.json({ error: 'Invalid token' }, 401)
  }
})
