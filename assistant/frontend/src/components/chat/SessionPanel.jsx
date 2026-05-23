import { s, STORAGE_MODES, relativeDate } from './styles.js';

export default function SessionPanel({
  sessions, currentId, onSelect, onNew, onDelete,
  searchQuery, onSearchChange, searchResults, searchLoading,
  storageMode, onStorageModeChange,
}) {
  const listToShow = searchResults !== null ? searchResults : [...sessions].reverse();

  return (
    <div style={s.panelInner}>
      <div style={s.panelHeader}>
        <button style={s.newBtn} onClick={onNew}>
          <span>＋</span> Nouvelle conversation
        </button>
      </div>

      <div style={s.searchBox}>
        <span style={s.searchIcon}>{searchLoading ? '…' : '⌕'}</span>
        <input
          style={s.searchInput}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Rechercher…"
        />
      </div>

      <div style={s.sessionList}>
        {listToShow.map(session => (
          <div
            key={session.id}
            style={s.sessionItem(session.id === currentId)}
            onClick={() => session.id && onSelect(session.id)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.sessionTitle(session.id === currentId)}>
                {session.title}
              </div>
              {session.snippet ? (
                <div style={s.snippetText}>{session.snippet}</div>
              ) : (
                <div style={s.sessionDate}>{relativeDate(session.createdAt || session.updated_at)}</div>
              )}
            </div>
            {searchResults === null && (
              <button
                style={s.deleteBtn}
                onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                title="Supprimer"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {searchResults !== null && searchResults.length === 0 && (
          <div style={{ padding: '16px 10px', color: '#444', fontSize: '12px', textAlign: 'center' }}>
            Aucun résultat
          </div>
        )}
      </div>

      <div style={s.storageBar}>
        {STORAGE_MODES.map(m => (
          <button
            key={m.value}
            style={s.storageBtn(storageMode === m.value)}
            title={m.title}
            onClick={() => onStorageModeChange(m.value)}
          >
            {m.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
