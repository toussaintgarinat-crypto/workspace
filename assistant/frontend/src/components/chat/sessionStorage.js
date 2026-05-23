// Session persistence (localStorage) — backward compat S24.
// Keys: ws_sessions, ws_current_session.

export function newSession() {
  return {
    id: crypto.randomUUID(),
    title: 'Nouvelle conversation',
    messages: [],
    createdAt: new Date().toISOString(),
  };
}

export function loadSessions() {
  try {
    const raw = JSON.parse(localStorage.getItem('ws_sessions') || '[]');
    // Drop stale pending upload proposals — file_id gone after reload
    return raw.map(s => ({
      ...s,
      messages: (s.messages || []).map(m =>
        m.uploadProposal?.status === 'pending'
          ? { ...m, uploadProposal: { ...m.uploadProposal, status: 'cancelled' } }
          : m
      ),
    }));
  } catch { return []; }
}

export function saveSessions(sessions) {
  localStorage.setItem('ws_sessions', JSON.stringify(sessions));
}

export function loadCurrentId(sessions) {
  const id = localStorage.getItem('ws_current_session');
  return sessions.find(s => s.id === id) ? id : sessions[0]?.id;
}

export function saveCurrentId(id) {
  localStorage.setItem('ws_current_session', id);
}

// Sérialise une session en markdown (utilisé pour push vers MemPalace en mode "mempalace").
export function sessionToMarkdown(session) {
  const lines = [`# ${session.title}`, `Date: ${session.createdAt}`, ''];
  for (const msg of session.messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      lines.push(`**${msg.role === 'user' ? 'Vous' : 'Assistant'}:** ${msg.content || ''}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
