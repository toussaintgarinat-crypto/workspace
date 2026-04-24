import { app } from '@/api'
import { initDb } from '@/db'
import { seedToolCatalog } from '@/db/seed'
import { initQdrant } from '@/memory'

const PORT = Number(process.env.CORE_PORT) || 3001

async function bootstrap() {
  await initDb()
  await seedToolCatalog()
  await initQdrant()

  // Bun serve natif avec support WebSocket
  Bun.serve({
    fetch: app.fetch,
    port: PORT,
    websocket: {
      message(ws, msg) { ws.data?.onMessage?.(msg) },
      open(ws)         { ws.data?.onOpen?.(ws) },
      close(ws)        { ws.data?.onClose?.() },
      error(ws, err)   { ws.data?.onError?.(err, ws) },
    },
  })

  console.log(`[forge:core] running on http://localhost:${PORT}`)
}

bootstrap()
