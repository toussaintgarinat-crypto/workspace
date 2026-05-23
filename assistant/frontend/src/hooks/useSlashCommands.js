import { useState, useMemo } from 'react';
import { SLASH_COMMANDS } from '../components/chat/styles.js';

// Gère la détection des slash commands dans l'input + suggestions + index sélectionné.
// L'exécution effective (search, save, task, summarize) reste dans ChatView (couplée aux APIs).
export function useSlashCommands(input) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuIdx, setSlashMenuIdx] = useState(0);

  const filtered = useMemo(() => {
    const firstWord = input.split(' ')[0];
    return SLASH_COMMANDS.filter(c => c.cmd.startsWith(firstWord));
  }, [input]);

  function onInputChange(val) {
    setShowSlashMenu(val.startsWith('/') && !val.includes(' '));
    setSlashMenuIdx(0);
  }

  function handleMenuKey(e, onSelect) {
    if (!showSlashMenu) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlashMenuIdx(i => (i + 1) % filtered.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlashMenuIdx(i => (i - 1 + filtered.length) % filtered.length);
      return true;
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      const chosen = filtered[slashMenuIdx];
      if (chosen) {
        onSelect(chosen.cmd + ' ');
        setShowSlashMenu(false);
      }
      return true;
    }
    if (e.key === 'Escape') {
      setShowSlashMenu(false);
      return true;
    }
    return false;
  }

  return {
    showSlashMenu,
    setShowSlashMenu,
    slashMenuIdx,
    setSlashMenuIdx,
    filtered,
    onInputChange,
    handleMenuKey,
  };
}
