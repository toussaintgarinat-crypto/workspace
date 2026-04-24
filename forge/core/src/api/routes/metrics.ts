import { Hono } from 'hono'
import { metrics } from '@/metrics'

export { metrics } from '@/metrics'

const app = new Hono()

app.get('/metrics', (c) => {
  const lines = Object.entries(metrics).map(([k, v]) =>
    `# TYPE forge_${k} counter\nforge_${k} ${v}`
  )
  return c.text(lines.join('\n') + '\n', 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  })
})

export default app
