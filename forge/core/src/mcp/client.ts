export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface MCPServerConfig {
  id: string
  nom: string
  url: string
  authType: 'none' | 'bearer' | 'basic'
  authToken: string
}

function headers(s: MCPServerConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (s.authType === 'bearer') h['Authorization'] = `Bearer ${s.authToken}`
  if (s.authType === 'basic')  h['Authorization'] = `Basic ${s.authToken}`
  return h
}

export async function listMCPTools(server: MCPServerConfig): Promise<MCPTool[]> {
  const res = await fetch(`${server.url}`, {
    method: 'POST',
    headers: headers(server),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  if (!res.ok) throw new Error(`MCP list failed: ${res.status}`)
  const data = await res.json() as any
  return data.result?.tools ?? []
}

export async function callMCPTool(
  server: MCPServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${server.url}`, {
    method: 'POST',
    headers: headers(server),
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })
  if (!res.ok) throw new Error(`MCP call failed: ${res.status}`)
  const data = await res.json() as any
  const content = data.result?.content
  if (Array.isArray(content)) return content.map((c: any) => c.text ?? JSON.stringify(c)).join('\n')
  return JSON.stringify(data.result ?? data)
}
