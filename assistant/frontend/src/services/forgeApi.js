import { apiFetch } from './api.js';

const BASE = '/api/v1/hub/forge';

export const forgeListAgents = () =>
  apiFetch(`${BASE}/agents`).then(r => r.json());

export const forgeRunAgent = (task, poleId = null) =>
  apiFetch(`${BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, pole_id: poleId }),
  }).then(r => r.json());
