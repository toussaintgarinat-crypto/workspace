import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const KEYCLOAK_URL   = process.env.KEYCLOAK_URL   || 'http://localhost:8080'
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'forge'
const JWKS_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`
const ISSUERS = [
  `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
  `http://localhost:8080/realms/${KEYCLOAK_REALM}`,
  `http://127.0.0.1:8080/realms/${KEYCLOAK_REALM}`,
]
const JWKS = createRemoteJWKSet(new URL(JWKS_URL))

export const voiceRealtimeRouter = new Hono()

// WS /api/voice/realtime?token=<jwt>&model=gpt-4o-realtime-preview
voiceRealtimeRouter.get(
  '/realtime',
  upgradeWebSocket(async (c) => {
    const tokenParam = c.req.query('token')
    const model = c.req.query('model') || 'gpt-4o-realtime-preview'

    let authorized = false
    try {
      await jwtVerify(tokenParam || '', JWKS, { issuer: ISSUERS })
      authorized = true
    } catch {}

    let openaiWs: WebSocket | null = null

    return {
      async onOpen(_, ws) {
        if (!authorized) {
          ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }))
          ws.close()
          return
        }

        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
          ws.send(JSON.stringify({ type: 'error', message: 'OPENAI_API_KEY non configuré' }))
          ws.close()
          return
        }

        openaiWs = new WebSocket(
          `wss://api.openai.com/v1/realtime?model=${model}`,
          ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
        )

        openaiWs.onopen = () => {
          ws.send(JSON.stringify({ type: 'realtime.connected', model }))
        }
        openaiWs.onmessage = (evt) => {
          ws.send(evt.data as string)
        }
        openaiWs.onerror = () => {
          ws.send(JSON.stringify({ type: 'error', message: 'OpenAI Realtime connection failed' }))
        }
        openaiWs.onclose = () => ws.close()
      },
      onMessage(evt, _ws) {
        if (openaiWs?.readyState === WebSocket.OPEN) {
          openaiWs.send(evt.data as string)
        }
      },
      onClose() {
        openaiWs?.close()
        openaiWs = null
      },
    }
  })
)
