import { getToken, refreshIfNeeded } from './keycloak.js';

const CAL_URL = import.meta.env.VITE_CALENDAR_URL || 'http://localhost:8400';

async function calFetch(path, opts = {}) {
  await refreshIfNeeded();
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${CAL_URL}${path}`, { ...opts, headers });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Calendars ──────────────────────────────────────────────────────────────────
export const listCalendars = () => calFetch('/calendars');

export const createCalendar = (body) =>
  calFetch('/calendars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const updateCalendar = (id, body) =>
  calFetch(`/calendars/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const deleteCalendar = (id) =>
  calFetch(`/calendars/${id}`, { method: 'DELETE' });

// ── Events ─────────────────────────────────────────────────────────────────────
export const listEvents = (calId, start, end) => {
  const p = new URLSearchParams();
  if (start) p.set('start', start.toISOString());
  if (end) p.set('end', end.toISOString());
  return calFetch(`/calendars/${calId}/events?${p}`);
};

export const createEvent = (calId, body) =>
  calFetch(`/calendars/${calId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const updateEvent = (id, body) =>
  calFetch(`/events/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const deleteEvent = (id) =>
  calFetch(`/events/${id}`, { method: 'DELETE' });

// ── Members ────────────────────────────────────────────────────────────────────
export const listMembers = (calId) => calFetch(`/calendars/${calId}/members`);

export const addMember = (calId, body) =>
  calFetch(`/calendars/${calId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const removeMember = (calId, userId) =>
  calFetch(`/calendars/${calId}/members/${userId}`, { method: 'DELETE' });

// ── Invitations ────────────────────────────────────────────────────────────────
export const listInvitations = (calId) => calFetch(`/calendars/${calId}/invitations`);

export const createInvitation = (calId, body) =>
  calFetch(`/calendars/${calId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const acceptInvitation = (token) =>
  calFetch(`/invitations/${token}/accept`, { method: 'POST' });

export const getInvitation = (token) => calFetch(`/invitations/${token}`);

// ── SSE helper ─────────────────────────────────────────────────────────────────
export function subscribeCalendarSSE(calId, onEvent) {
  const url = `${CAL_URL}/sse/calendars/${calId}`;
  const es = new EventSource(url);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch {}
  };
  return () => es.close();
}
