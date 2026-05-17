import { getToken, refreshIfNeeded } from './keycloak.js';

const BASE_URL = '/api';

export async function apiFetch(url, options = {}) {
  await refreshIfNeeded();
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

// ── Vault (token store chiffré) ───────────────────────────────────────────────

export async function getVaultTokens() {
  const res = await apiFetch(`${BASE_URL}/vault/tokens`);
  if (!res.ok) return [];
  return res.json();
}

export async function storeVaultToken(appType, accessToken, refreshToken = null, expiresAt = null) {
  const res = await apiFetch(`${BASE_URL}/vault/tokens/${appType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteVaultToken(appType) {
  const res = await apiFetch(`${BASE_URL}/vault/tokens/${appType}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function oauthCallback(appType, body) {
  const res = await apiFetch(`${BASE_URL}/vault/oauth-callback/${appType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getConnections() {
  const res = await apiFetch(`${BASE_URL}/connections`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function upsertConnection(data) {
  const res = await apiFetch(`${BASE_URL}/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteConnection(id) {
  const res = await apiFetch(`${BASE_URL}/connections/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Gateway management ────────────────────────────────────────────────────────

export async function gatewayListModels() {
  const res = await apiFetch(`${BASE_URL}/gateway/models`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function gatewayAddModel(body) {
  const res = await apiFetch(`${BASE_URL}/gateway/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function gatewayDeleteModel(modelId) {
  const res = await apiFetch(`${BASE_URL}/gateway/models/${encodeURIComponent(modelId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function gatewayListKeys() {
  const res = await apiFetch(`${BASE_URL}/gateway/keys`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function gatewayAddKey(body) {
  const res = await apiFetch(`${BASE_URL}/gateway/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function gatewayDeleteKey(key) {
  const res = await apiFetch(`${BASE_URL}/gateway/keys/${encodeURIComponent(key)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── MemPalace proxy ───────────────────────────────────────────────────────────

export async function mempalaceWings() {
  const res = await apiFetch(`${BASE_URL}/mempalace/wings`);
  if (res.status === 503) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function mempalaceSearch(query, wing = null, nResults = 10) {
  const res = await apiFetch(`${BASE_URL}/mempalace/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, wing, n_results: nResults }),
  });
  if (res.status === 503) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function mempalaceEntries(wing, limit = 50) {
  const res = await apiFetch(`${BASE_URL}/mempalace/entries/${encodeURIComponent(wing)}?limit=${limit}`);
  if (res.status === 503) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Swarm ─────────────────────────────────────────────────────────────────────

export async function swarmListTasks() {
  const res = await apiFetch(`${BASE_URL}/swarm/tasks`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function swarmCreateTask(title, role, instructions) {
  const res = await apiFetch(`${BASE_URL}/swarm/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, role, instructions }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function swarmMarkDone(taskId) {
  const res = await apiFetch(`${BASE_URL}/swarm/tasks/${taskId}/done`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function swarmCancelTask(taskId) {
  const res = await apiFetch(`${BASE_URL}/swarm/tasks/${taskId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Voice ─────────────────────────────────────────────────────────────────────

export async function getVoiceSettings() {
  const res = await apiFetch(`${BASE_URL}/voice/settings`);
  if (!res.ok) return null;
  return res.json();
}

export async function saveVoiceSettingsToBackend(settings) {
  const res = await apiFetch(`${BASE_URL}/voice/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function transcribeAudio(audioBlob, language = 'fr-FR') {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  formData.append('language', language);
  const res = await apiFetch(`${BASE_URL}/voice/transcribe`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function synthesizeText(text, voice = null) {
  const res = await apiFetch(`${BASE_URL}/voice/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch(`${BASE_URL}/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function confirmDocument({ file_id, filename, wing, room, summary }) {
  const res = await apiFetch(`${BASE_URL}/upload/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id, filename, wing, room, summary }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function summarizeConversation(messages, sessionId = '') {
  const res = await apiFetch(`${BASE_URL}/conversation/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchAvailableModels() {
  try {
    const res = await apiFetch(`${BASE_URL}/models`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function streamChat(
  messages,
  onChunk,
  onToolStart,
  onTool,
  onDone,
  usePromptEngineer = false,
  onPromptRefined = null,
  useRag = true,
  onRagSources = null,
  model = null,
) {
  const payload = { messages, use_prompt_engineer: usePromptEngineer, rag_enabled: useRag };
  if (model) payload.model = model;
  const res = await apiFetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
      else if (event.type === 'tool_start') onToolStart(event.name, event.args || {});
      else if (event.type === 'tool_result') onTool(event.name, event.result, event.error || false);
      else if (event.type === 'prompt_refined' && onPromptRefined) onPromptRefined(event.data);
      else if (event.type === 'rag_sources' && onRagSources) onRagSources(event.sources);
      else if (event.type === 'done') { onDone(); return; }
    }
  }

  onDone();
}
