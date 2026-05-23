import { useRef, useCallback, useEffect } from 'react';
import { summarizeConversation } from '../services/api.js';

const SUMMARIZE_THRESHOLD = 20;

// Résume la conversation : appel manuel via trigger() ou auto tous les 20 messages.
// Affiche un toast via showToast (passé en prop par l'appelant).
export function useConversationSummarizer({ messages, currentId, isStreaming, enabled, showToast }) {
  const summarizingRef = useRef(false);

  const trigger = useCallback(async (msgs) => {
    if (summarizingRef.current) return;
    const chatMsgs = (msgs || messages).filter(m => m.role === 'user' || m.role === 'assistant');
    if (chatMsgs.length < 2) return;
    summarizingRef.current = true;
    try {
      const { summary, stored } = await summarizeConversation(chatMsgs, currentId || '');
      if (summary) {
        showToast(stored ? '📝 Résumé sauvegardé dans MemPalace' : '📝 Résumé généré (MemPalace non connecté)');
      }
    } catch (e) { /* silent */ } finally {
      summarizingRef.current = false;
    }
  }, [messages, currentId, showToast]);

  useEffect(() => {
    if (!enabled || isStreaming) return;
    const chatCount = messages.filter(m => m.role === 'user' || m.role === 'assistant').length;
    if (chatCount > 0 && chatCount % SUMMARIZE_THRESHOLD === 0) trigger(messages);
  }, [messages.length, isStreaming, enabled, trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  return { trigger };
}
