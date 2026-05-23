import { useState, useEffect } from 'react';
import { searchConversations, mempalaceSearch } from '../services/api.js';

// Recherche cross-mode (local / cloud / mempalace), debouncée 300ms.
// Retourne { searchQuery, setSearchQuery, searchResults, searchLoading }.
// searchResults === null tant qu'aucune recherche n'est active.
export function useSessionSearch({ sessions, storageMode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        if (storageMode === 'local') {
          const q = searchQuery.toLowerCase();
          const results = sessions
            .filter(s =>
              s.title.toLowerCase().includes(q) ||
              s.messages.some(m => (m.content || '').toLowerCase().includes(q))
            )
            .map(s => {
              const matchMsg = s.messages.find(m => (m.content || '').toLowerCase().includes(q));
              const content = matchMsg?.content || '';
              const idx = content.toLowerCase().indexOf(q);
              const start = Math.max(0, idx - 60);
              const end = Math.min(content.length, idx + q.length + 60);
              const snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
              return { id: s.id, title: s.title, snippet, createdAt: s.createdAt };
            });
          setSearchResults(results);
        } else if (storageMode === 'cloud') {
          const data = await searchConversations(searchQuery);
          setSearchResults((data.results || []).map(r => ({ ...r, createdAt: r.updated_at })));
        } else if (storageMode === 'mempalace') {
          const data = await mempalaceSearch(searchQuery, 'Input', 20);
          const results = (data?.results || [])
            .filter(r => r.metadata?.room === 'conversations')
            .map(r => ({
              id: r.metadata?.session_id || null,
              title: r.metadata?.title || 'Conversation',
              snippet: (r.content || '').slice(0, 120),
              createdAt: r.metadata?.added_at,
            }));
          setSearchResults(results);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, storageMode, sessions]);

  return { searchQuery, setSearchQuery, searchResults, searchLoading };
}
