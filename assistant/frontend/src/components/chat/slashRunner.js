import { mempalaceSearch, addMempalaceDrawer, swarmCreateTask, apiFetch } from '../../services/api.js';

// Exécute une slash command. Retourne true si elle a été interceptée (l'appelant doit return).
// Retourne false si la commande est inconnue → fall-through LLM.
export async function runSlashCommand({ trimmed, setMessages, setToast, triggerSummarize }) {
  const parts = trimmed.slice(1).split(' ');
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ').trim();

  const usage = (msg) => {
    setToast({ msg, type: 'error' });
    setTimeout(() => setToast(null), 3000);
  };
  const appendUser = () => setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
  const appendAssistant = (content) => setMessages(prev => [...prev, { role: 'assistant', content, tools: [] }]);

  if (cmd === 'summarize') {
    triggerSummarize();
    return true;
  }
  if (cmd === 'search') {
    if (!arg) { usage('Usage : /search <requête>'); return true; }
    appendUser();
    try {
      const results = await mempalaceSearch(arg, null, 8);
      const items = results?.results || results || [];
      const reply = items.length
        ? `**Résultats MemPalace pour « ${arg} »**\n\n` + items.map((r, i) => `${i + 1}. ${r.content?.slice(0, 200) || JSON.stringify(r)}`).join('\n\n')
        : `Aucun résultat pour « ${arg} ».`;
      appendAssistant(reply);
    } catch {
      appendAssistant('Erreur lors de la recherche.');
    }
    return true;
  }
  if (cmd === 'save') {
    if (!arg) { usage('Usage : /save <contenu>'); return true; }
    appendUser();
    try {
      await addMempalaceDrawer(arg, 'Input', 'notes', { source: 'slash_command' });
      appendAssistant(`Sauvegardé dans MemPalace : « ${arg.slice(0, 80)}${arg.length > 80 ? '…' : ''} »`);
    } catch {
      appendAssistant('Erreur lors de la sauvegarde.');
    }
    return true;
  }
  if (cmd === 'task') {
    if (!arg) { usage('Usage : /task <titre>'); return true; }
    appendUser();
    try {
      await swarmCreateTask(arg, 'assistant', `Tâche créée via /task : ${arg}`);
      appendAssistant(`Tâche créée : **${arg}**`);
    } catch {
      appendAssistant('Erreur lors de la création de tâche.');
    }
    return true;
  }
  if (cmd === 'forge') {
    if (!arg) { usage('Usage : /forge <tâche>'); return true; }
    appendUser();
    try {
      const r = await apiFetch('/api/v1/hub/forge/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: arg }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const result = data?.result ?? data?.text ?? JSON.stringify(data);
      appendAssistant(`**⚒️ Forge — résultat :**\n\n${result}`);
    } catch {
      appendAssistant('Forge indisponible ou non configuré (FORGE_URL manquant).');
    }
    return true;
  }
  if (cmd === 'apps') {
    appendUser();
    try {
      const r = await apiFetch('/api/v1/hub/services');
      if (!r.ok) throw new Error();
      const services = await r.json();
      const lines = services.map(s => {
        const icon = s.status === 'ok' ? '🟢' : s.status === 'down' ? '🔴' : s.status === 'disabled' ? '⚫' : '🟡';
        const link = s.frontend_url ? ` — [Ouvrir](${s.frontend_url})` : '';
        return `${icon} **${s.emoji} ${s.label}**${link}`;
      });
      appendAssistant(`**🏛️ Services de la plateforme :**\n\n${lines.join('\n')}`);
    } catch {
      appendAssistant('Impossible de récupérer le statut des services.');
    }
    return true;
  }
  return false;
}
