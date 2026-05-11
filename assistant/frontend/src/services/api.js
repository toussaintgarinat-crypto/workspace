const BASE_URL = '/api';

// ── Vault (token store chiffré) ───────────────────────────────────────────────

export async function getVaultTokens() {
  const res = await fetch(`${BASE_URL}/vault/tokens`);
  if (!res.ok) return [];
  return res.json();
}

export async function storeVaultToken(appType, accessToken, refreshToken = null, expiresAt = null) {
  const res = await fetch(`${BASE_URL}/vault/tokens/${appType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteVaultToken(appType) {
  const res = await fetch(`${BASE_URL}/vault/tokens/${appType}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function oauthCallback(appType, body) {
  const res = await fetch(`${BASE_URL}/vault/oauth-callback/${appType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getConnections() {
  const res = await fetch(`${BASE_URL}/connections`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function upsertConnection(data) {
  const res = await fetch(`${BASE_URL}/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteConnection(id) {
  const res = await fetch(`${BASE_URL}/connections/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function streamChat(messages, onChunk, onTool, onDone) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;

      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }

      if (event.type === 'text') onChunk(event.content);
      else if (event.type === 'tool_result') onTool(event.name, event.result);
      else if (event.type === 'done') { onDone(); return; }
    }
  }

  onDone();
}
