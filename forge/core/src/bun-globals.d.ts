declare const Bun: {
  serve(options: {
    fetch: (req: Request) => Response | Promise<Response>
    port?: number
    websocket?: {
      message: (ws: BunServerWebSocket, msg: string | Buffer) => void
      open: (ws: BunServerWebSocket) => void
      close: (ws: BunServerWebSocket) => void
      error: (ws: BunServerWebSocket, err: Error) => void
    }
  }): void
}

interface BunServerWebSocket {
  data?: {
    onMessage?: (msg: string | Buffer) => void
    onOpen?: (ws: BunServerWebSocket) => void
    onClose?: () => void
    onError?: (err: Error, ws: BunServerWebSocket) => void
  }
  send(msg: string | Buffer): void
  close(): void
}
