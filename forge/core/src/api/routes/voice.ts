import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '@/api/middleware/auth'

export const voiceRouter = new Hono()
voiceRouter.use('*', authMiddleware)

// ── STT: POST /api/voice/transcribe ──────────────────────────────
// Form fields: audio (File), provider? ('groq'|'openai'|'deepgram')
voiceRouter.post('/transcribe', async (c) => {
  const formData = await c.req.formData()
  const audio    = formData.get('audio') as File | null
  const provider = (formData.get('provider') as string) || 'groq'

  if (!audio) return c.json({ error: 'Champ audio manquant' }, 400)

  switch (provider) {
    case 'openai':   return transcribeOpenAI(c, audio)
    case 'deepgram': return transcribeDeepgram(c, audio)
    default:         return transcribeGroq(c, audio)
  }
})

async function transcribeGroq(c: any, audio: File) {
  const key = process.env.GROQ_API_KEY
  if (!key) return c.json({ error: 'GROQ_API_KEY non configuré' }, 503)

  const fd = new FormData()
  fd.append('file', audio, audio.name || 'audio.webm')
  fd.append('model', 'whisper-large-v3-turbo')
  fd.append('response_format', 'json')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  })
  if (!res.ok) {
    console.error('[forge:stt:groq]', await res.text())
    return c.json({ error: 'Erreur transcription Groq' }, 502)
  }
  const data = await res.json() as { text: string }
  return c.json({ text: data.text })
}

async function transcribeOpenAI(c: any, audio: File) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return c.json({ error: 'OPENAI_API_KEY non configuré' }, 503)

  const fd = new FormData()
  fd.append('file', audio, audio.name || 'audio.webm')
  fd.append('model', 'whisper-1')
  fd.append('response_format', 'json')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  })
  if (!res.ok) {
    console.error('[forge:stt:openai]', await res.text())
    return c.json({ error: 'Erreur transcription OpenAI' }, 502)
  }
  const data = await res.json() as { text: string }
  return c.json({ text: data.text })
}

async function transcribeDeepgram(c: any, audio: File) {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) return c.json({ error: 'DEEPGRAM_API_KEY non configuré' }, 503)

  const buf = await audio.arrayBuffer()
  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true', {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': audio.type || 'audio/webm',
    },
    body: buf,
  })
  if (!res.ok) {
    console.error('[forge:stt:deepgram]', await res.text())
    return c.json({ error: 'Erreur transcription Deepgram' }, 502)
  }
  const data = await res.json() as any
  const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
  return c.json({ text })
}

// ── TTS: POST /api/voice/synthesize ──────────────────────────────
voiceRouter.post(
  '/synthesize',
  zValidator('json', z.object({
    text:     z.string().min(1).max(4096),
    provider: z.enum(['openai', 'elevenlabs']).default('openai'),
    voice:    z.string().default('nova'),
    speed:    z.number().min(0.25).max(4).default(1),
  })),
  async (c) => {
    const { text, provider, voice, speed } = c.req.valid('json')
    if (provider === 'elevenlabs') return synthesizeElevenLabs(c, text, voice)
    return synthesizeOpenAI(c, text, voice, speed)
  }
)

async function synthesizeOpenAI(c: any, text: string, voice: string, speed: number) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return c.json({ error: 'OPENAI_API_KEY non configuré' }, 503)

  const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
  const safeVoice = VALID_VOICES.includes(voice) ? voice : 'nova'

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', input: text, voice: safeVoice, speed }),
  })
  if (!res.ok) {
    console.error('[forge:tts:openai]', await res.text())
    return c.json({ error: 'Erreur synthèse OpenAI' }, 502)
  }
  const audio = await res.arrayBuffer()
  return c.body(audio, 200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' })
}

async function synthesizeElevenLabs(c: any, text: string, voiceId: string) {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return c.json({ error: 'ELEVENLABS_API_KEY non configuré' }, 503)

  // Default: Sarah (EXAVITQu4vr4xnSDxMaL)
  const vid = voiceId || 'EXAVITQu4vr4xnSDxMaL'
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!res.ok) {
    console.error('[forge:tts:elevenlabs]', await res.text())
    return c.json({ error: 'Erreur synthèse ElevenLabs' }, 502)
  }
  const audio = await res.arrayBuffer()
  return c.body(audio, 200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' })
}
