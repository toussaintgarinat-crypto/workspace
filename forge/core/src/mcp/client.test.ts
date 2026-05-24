import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { listMCPTools, callMCPTool, type MCPServerConfig } from './client'

const baseServer: MCPServerConfig = {
  id: 'srv-1',
  nom: 'demo',
  url: 'http://mcp.test/jsonrpc',
  authType: 'none',
  authToken: '',
}

let fetchMock: ReturnType<typeof mock>

beforeEach(() => {
  fetchMock = mock(async () => new Response('{}', { status: 200 }))
  ;(globalThis as any).fetch = fetchMock
})

describe('listMCPTools', () => {
  test('returns tool list from JSON-RPC response', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      result: { tools: [{ name: 'foo', description: 'd', inputSchema: {} }] },
    }), { status: 200 }))

    const tools = await listMCPTools(baseServer)
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('foo')
  })

  test('returns [] when result.tools is missing', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }))
    expect(await listMCPTools(baseServer)).toEqual([])
  })

  test('throws on non-2xx', async () => {
    fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }))
    await expect(listMCPTools(baseServer)).rejects.toThrow(/MCP list failed: 500/)
  })

  test('bearer auth attaches Authorization header', async () => {
    let captured: Headers | undefined
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      captured = new Headers(init.headers)
      return new Response('{}', { status: 200 })
    })
    await listMCPTools({ ...baseServer, authType: 'bearer', authToken: 'sk-xyz' })
    expect(captured?.get('authorization')).toBe('Bearer sk-xyz')
  })

  test('basic auth attaches Basic header', async () => {
    let captured: Headers | undefined
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      captured = new Headers(init.headers)
      return new Response('{}', { status: 200 })
    })
    await listMCPTools({ ...baseServer, authType: 'basic', authToken: 'dXNyOnB3' })
    expect(captured?.get('authorization')).toBe('Basic dXNyOnB3')
  })

  test('no auth → no Authorization header', async () => {
    let captured: Headers | undefined
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      captured = new Headers(init.headers)
      return new Response('{}', { status: 200 })
    })
    await listMCPTools(baseServer)
    expect(captured?.get('authorization')).toBeNull()
  })
})

describe('callMCPTool', () => {
  test('joins text content array', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      result: { content: [{ text: 'hello' }, { text: 'world' }] },
    }), { status: 200 }))

    const out = await callMCPTool(baseServer, 'echo', { msg: 'hi' })
    expect(out).toBe('hello\nworld')
  })

  test('falls back to JSON.stringify when content is not an array', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      result: { ok: true, value: 42 },
    }), { status: 200 }))

    const out = await callMCPTool(baseServer, 'op', {})
    expect(JSON.parse(out)).toEqual({ ok: true, value: 42 })
  })

  test('sends JSON-RPC tools/call with arguments', async () => {
    let body: any
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string)
      return new Response('{}', { status: 200 })
    })
    await callMCPTool(baseServer, 'sum', { a: 1, b: 2 })
    expect(body.method).toBe('tools/call')
    expect(body.params).toEqual({ name: 'sum', arguments: { a: 1, b: 2 } })
  })

  test('throws on non-2xx', async () => {
    fetchMock.mockImplementation(async () => new Response('nope', { status: 401 }))
    await expect(callMCPTool(baseServer, 'x', {})).rejects.toThrow(/MCP call failed: 401/)
  })
})
