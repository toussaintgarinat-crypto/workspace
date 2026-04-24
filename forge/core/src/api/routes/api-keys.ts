import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '@/db'
import { providerApiKeys } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { encrypt, maskKey } from '@/config/crypto'
import { invalidateCache } from '@/config/keystore'

export const apiKeysRouter = new Hono()

const PROVIDERS = [
  { id: 'openai',      label: 'OpenAI',      placeholder: 'sk-...',          url: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic',   label: 'Anthropic',   placeholder: 'sk-ant-...',      url: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini',      label: 'Gemini',      placeholder: 'AIza...',         url: 'https://aistudio.google.com/app/apikey' },
  { id: 'mistral',     label: 'Mistral',     placeholder: 'xxxxxxxx...',     url: 'https://console.mistral.ai/api-keys' },
  { id: 'groq',        label: 'Groq',        placeholder: 'gsk_...',         url: 'https://console.groq.com/keys' },
  { id: 'deepseek',    label: 'DeepSeek',    placeholder: 'sk-...',          url: 'https://platform.deepseek.com/api_keys' },
  { id: 'openrouter',  label: 'OpenRouter',  placeholder: 'sk-or-...',       url: 'https://openrouter.ai/keys' },
  { id: 'elevenlabs',  label: 'ElevenLabs',  placeholder: 'sk_...',          url: 'https://elevenlabs.io/app/speech-synthesis' },
  { id: 'deepgram',    label: 'Deepgram',    placeholder: 'Token xxxxxxxx',  url: 'https://console.deepgram.com/project' },
  { id: 'ollama',      label: 'Ollama',      placeholder: 'http://localhost:11434', url: '' },
]

// GET /api/settings/api-keys — liste les providers + statut
apiKeysRouter.get('/', async (c) => {
  const user = c.get('user') as { sub: string }

  const rows = await db.select().from(providerApiKeys)
    .where(eq(providerApiKeys.userId, user.sub))

  const configured = new Map(rows.map(r => [r.provider, r]))

  const result = PROVIDERS.map(p => {
    const row = configured.get(p.id)
    const envKey = process.env[`${p.id.toUpperCase()}_API_KEY`] ?? process.env['OLLAMA_BASE_URL']
    return {
      ...p,
      configured: !!row,
      fromEnv:    !row && !!envKey,
      hint:       row?.hint ?? '',
      updatedAt:  row?.updatedAt ?? null,
    }
  })

  return c.json(result)
})

// PUT /api/settings/api-keys/:provider — créer ou mettre à jour une clé
apiKeysRouter.put(
  '/:provider',
  zValidator('json', z.object({ key: z.string().min(1) })),
  async (c) => {
    const user     = c.get('user') as { sub: string }
    const provider = c.req.param('provider')
    const { key }  = c.req.valid('json')

    if (!PROVIDERS.find(p => p.id === provider)) {
      return c.json({ error: 'Unknown provider' }, 400)
    }

    const encryptedKey = await encrypt(key)
    const hint = maskKey(key)

    await db.insert(providerApiKeys)
      .values({ userId: user.sub, provider, encryptedKey, hint, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [providerApiKeys.userId, providerApiKeys.provider],
        set: { encryptedKey, hint, updatedAt: new Date() },
      })

    invalidateCache(user.sub, provider)
    return c.json({ ok: true, hint })
  }
)

// DELETE /api/settings/api-keys/:provider — supprimer une clé
apiKeysRouter.delete('/:provider', async (c) => {
  const user     = c.get('user') as { sub: string }
  const provider = c.req.param('provider')

  await db.delete(providerApiKeys)
    .where(and(eq(providerApiKeys.userId, user.sub), eq(providerApiKeys.provider, provider)))

  invalidateCache(user.sub, provider)
  return c.json({ ok: true })
})
