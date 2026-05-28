/**
 * ToolHub service — appels S2S vers le service ToolHub (port 8500).
 * Utilisé par les agents Forge pour exécuter des outils externes (Gmail, GitHub, MCP, etc.)
 */

const TOOLHUB_BASE = process.env.TOOLHUB_URL ?? "http://toolhub:8500"
const TOOLHUB_TOKEN = process.env.TOOLHUB_SERVICE_TOKEN ?? ""

interface ExecuteResult {
  result: unknown
  from_cache: boolean
  duration_ms: number
}

interface ToolInfo {
  name: string
  label: string
  integration_type: string
  enabled: boolean
  actions: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
}

function buildHeaders(userId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOOLHUB_TOKEN}`,
    "X-User-Id": userId,
  }
}

export async function executeToolHubAction(
  toolName: string,
  action: string,
  params: Record<string, unknown>,
  userId: string,
): Promise<unknown> {
  const res = await fetch(`${TOOLHUB_BASE}/v1/execute/${toolName}`, {
    method: "POST",
    headers: buildHeaders(userId),
    body: JSON.stringify({ action, params }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `ToolHub ${toolName}/${action} failed: ${res.status} ${JSON.stringify(err)}`,
    )
  }
  const data: ExecuteResult = await res.json()
  return data.result
}

export async function listToolHubTools(userId: string): Promise<ToolInfo[]> {
  const res = await fetch(`${TOOLHUB_BASE}/v1/tools`, {
    headers: buildHeaders(userId),
  })
  if (!res.ok) {
    throw new Error(`ToolHub listTools failed: ${res.status}`)
  }
  return res.json()
}

export async function callMCP(
  toolAction: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<unknown> {
  const res = await fetch(`${TOOLHUB_BASE}/v1/mcp`, {
    method: "POST",
    headers: buildHeaders(userId),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolAction, arguments: args },
    }),
  })
  const data = await res.json()
  if (data.error) {
    throw new Error(`MCP error: ${JSON.stringify(data.error)}`)
  }
  return data.result
}
