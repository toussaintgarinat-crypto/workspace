import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../../db'
import { gitpackJobs } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { generateText } from 'ai'
import { getModel } from '../../llm'
import type { JWTPayload } from '../middleware/auth'

const app = new Hono<{ Variables: { user: JWTPayload } }>()

app.get('/gitpack/jobs', async (c) => {
  const user = c.get('user')
  const list = await db.select().from(gitpackJobs)
    .where(eq(gitpackJobs.userId, user.sub))
    .orderBy(desc(gitpackJobs.createdAt))
  return c.json(list)
})

app.get('/gitpack/jobs/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const [job] = await db.select().from(gitpackJobs)
    .where(and(eq(gitpackJobs.id, id), eq(gitpackJobs.userId, user.sub)))
  if (!job) return c.json({ error: 'Not found' }, 404)
  return c.json(job)
})

app.post('/gitpack/analyze', zValidator('json', z.object({
  githubUrl: z.string().url(),
  platform:  z.enum(['macos', 'windows', 'linux']).optional(),
})), async (c) => {
  const user = c.get('user')
  const { githubUrl, platform = 'macos' } = c.req.valid('json')

  // Créer le job
  const [job] = await db.insert(gitpackJobs).values({
    userId: user.sub,
    githubUrl,
    platform,
    statut: 'running',
  }).returning()

  // Analyse IA du repo
  ;(async () => {
    try {
      const repoName = githubUrl.split('/').slice(-2).join('/')
      const model = getModel()
      const { text } = await generateText({
        model,
        messages: [{
          role: 'user',
          content: `Analyse ce repo GitHub: ${githubUrl}

Détecte :
1. Le langage principal (Python, Node.js, Go, Rust, etc.)
2. Le framework (Flask, Express, Gin, etc.)
3. Les dépendances principales
4. Les instructions de build pour ${platform}
5. Les risques ou blocages potentiels

Réponds en JSON structuré :
{
  "language": "...",
  "framework": "...",
  "dependencies": [...],
  "buildSteps": [...],
  "risks": [...],
  "estimatedSize": "...",
  "compatible": true/false
}`
        }],
        maxTokens: 800,
      })

      let analysis: Record<string, unknown> = {}
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) analysis = JSON.parse(jsonMatch[0])
      } catch {}

      await db.update(gitpackJobs).set({
        statut: 'done',
        language: analysis.language as string || 'Unknown',
        framework: analysis.framework as string || '',
        logs: JSON.stringify([
          `✅ Analyse terminée pour ${repoName}`,
          `Langage: ${analysis.language || '?'}`,
          `Framework: ${analysis.framework || '?'}`,
          ...(analysis.buildSteps as string[] || []).map((s: string) => `→ ${s}`),
          ...(analysis.risks as string[] || []).map((r: string) => `⚠️ ${r}`),
        ]),
        updatedAt: new Date(),
      }).where(eq(gitpackJobs.id, job.id))
    } catch (e: any) {
      await db.update(gitpackJobs).set({
        statut: 'error',
        error: e.message,
        updatedAt: new Date(),
      }).where(eq(gitpackJobs.id, job.id))
    }
  })()

  return c.json(job, 202)
})

app.delete('/gitpack/jobs/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  await db.delete(gitpackJobs).where(and(eq(gitpackJobs.id, id), eq(gitpackJobs.userId, user.sub)))
  return c.json({ ok: true })
})

export default app
