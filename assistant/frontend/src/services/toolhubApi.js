import { apiFetch } from './api.js';

const BASE = '/api/v1/hub/toolhub';

export const toolhubListTools = () =>
  apiFetch(`${BASE}/tools`).then(r => r.json());

export const toolhubExecute = (toolName, action, params = {}) =>
  apiFetch(`${BASE}/execute/${toolName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params }),
  }).then(r => r.json());
