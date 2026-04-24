import { Hono } from 'hono'

const netbirdRouter = new Hono()

const NETBIRD_API_URL = process.env.NETBIRD_API_URL || 'https://api.netbird.io'
const NETBIRD_TOKEN   = process.env.NETBIRD_TOKEN   || ''

// ── Proxy générique vers l'API NetBird ───────────────────────
// Toutes les routes sont transmises telles quelles avec le PAT serveur.
// Le token Keycloak de l'utilisateur Forge a déjà été validé par authMiddleware.

async function proxyToNetbird(path: string, method: string, body?: unknown) {
  if (!NETBIRD_TOKEN) {
    return { status: 503, data: { error: 'NetBird not configured: NETBIRD_TOKEN is missing' } }
  }

  const headers: HeadersInit = {
    'Content-Type':  'application/json',
    'Accept':        'application/json',
    'Authorization': `Token ${NETBIRD_TOKEN}`,
  }

  try {
    const res = await fetch(`${NETBIRD_API_URL}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  } catch (err: any) {
    return { status: 503, data: { error: `NetBird unreachable: ${err.message}` } }
  }
}

// ── Peers ────────────────────────────────────────────────────
netbirdRouter.get('/peers', async (c) => {
  const { status, data } = await proxyToNetbird('/api/peers', 'GET')
  return c.json(data, status as 200)
})

// ── Groups ───────────────────────────────────────────────────
netbirdRouter.get('/groups', async (c) => {
  const { status, data } = await proxyToNetbird('/api/groups', 'GET')
  return c.json(data, status as 200)
})

netbirdRouter.post('/groups', async (c) => {
  const body = await c.req.json()
  const { status, data } = await proxyToNetbird('/api/groups', 'POST', body)
  return c.json(data, status as 200)
})

netbirdRouter.put('/groups/:id', async (c) => {
  const body = await c.req.json()
  const { status, data } = await proxyToNetbird(`/api/groups/${c.req.param('id')}`, 'PUT', body)
  return c.json(data, status as 200)
})

netbirdRouter.delete('/groups/:id', async (c) => {
  const { status, data } = await proxyToNetbird(`/api/groups/${c.req.param('id')}`, 'DELETE')
  return c.json(data, status as 200)
})

// ── Policies ─────────────────────────────────────────────────
netbirdRouter.get('/policies', async (c) => {
  const { status, data } = await proxyToNetbird('/api/policies', 'GET')
  return c.json(data, status as 200)
})

netbirdRouter.post('/policies', async (c) => {
  const body = await c.req.json()
  const { status, data } = await proxyToNetbird('/api/policies', 'POST', body)
  return c.json(data, status as 200)
})

netbirdRouter.put('/policies/:id', async (c) => {
  const body = await c.req.json()
  const { status, data } = await proxyToNetbird(`/api/policies/${c.req.param('id')}`, 'PUT', body)
  return c.json(data, status as 200)
})

netbirdRouter.delete('/policies/:id', async (c) => {
  const { status, data } = await proxyToNetbird(`/api/policies/${c.req.param('id')}`, 'DELETE')
  return c.json(data, status as 200)
})

// ── Routes ───────────────────────────────────────────────────
netbirdRouter.get('/routes', async (c) => {
  const { status, data } = await proxyToNetbird('/api/routes', 'GET')
  return c.json(data, status as 200)
})

// ── DNS ──────────────────────────────────────────────────────
netbirdRouter.get('/dns', async (c) => {
  const { status, data } = await proxyToNetbird('/api/dns/nameservers', 'GET')
  return c.json(data, status as 200)
})

// ── Setup Keys (enrollment) ──────────────────────────────────
netbirdRouter.post('/setup-keys', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { status, data } = await proxyToNetbird('/api/setup-keys', 'POST', {
    name:         `forge-${Date.now()}`,
    type:         'one-off',
    expires_in:   86400,
    usage_limit:  1,
    auto_groups:  body.groups ?? [],
    ephemeral:    false,
  })
  return c.json(data, status as 200)
})

netbirdRouter.get('/setup-keys', async (c) => {
  const { status, data } = await proxyToNetbird('/api/setup-keys', 'GET')
  return c.json(data, status as 200)
})

export default netbirdRouter
