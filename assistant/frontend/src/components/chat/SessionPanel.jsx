import { useState } from 'react';
import { s, STORAGE_MODES, relativeDate } from './styles.js';
import { useFolders } from '../../hooks/useFolders.js';

const TAG_COLORS = ['#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777'];
function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffff;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export default function SessionPanel({
  sessions, currentId, onSelect, onNew, onDelete,
  searchQuery, onSearchChange, searchResults, searchLoading,
  storageMode, onStorageModeChange,
}) {
  const {
    folders, selectedFolder, setSelectedFolder, convMeta,
    createFolder, removeFolder, moveToFolder, addTag, removeTag,
  } = useFolders({ storageMode });

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [tagInputFor, setTagInputFor] = useState(null);
  const [tagDraft, setTagDraft] = useState('');
  const [folderDropFor, setFolderDropFor] = useState(null);

  const isCloud = storageMode === 'cloud';

  let listToShow = searchResults !== null
    ? searchResults
    : [...sessions].reverse();

  if (isCloud && selectedFolder !== null && searchResults === null) {
    listToShow = listToShow.filter(sess => convMeta[sess.id]?.folder_id === selectedFolder);
  }

  async function handleCreateFolder(e) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) { setShowNewFolder(false); return; }
    await createFolder(name).catch(() => {});
    setNewFolderName('');
    setShowNewFolder(false);
  }

  async function handleAddTag(convId) {
    if (!tagDraft.trim()) { setTagInputFor(null); return; }
    await addTag(convId, tagDraft).catch(() => {});
    setTagDraft('');
    setTagInputFor(null);
  }

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

      {/* Folder bar — cloud mode only */}
      {isCloud && (
        <div style={s.folderBar}>
          <button
            style={s.folderPill(selectedFolder === null)}
            onClick={() => setSelectedFolder(null)}
          >
            Tout
          </button>
          {folders.map(f => (
            <span key={f.id} style={s.folderPillWrap}>
              <button
                style={s.folderPill(selectedFolder === f.id)}
                onClick={() => setSelectedFolder(f.id)}
              >
                📁 {f.name}
              </button>
              <button
                style={s.folderPillX}
                onClick={e => { e.stopPropagation(); removeFolder(f.id).catch(() => {}); }}
                title="Supprimer ce dossier"
              >
                ×
              </button>
            </span>
          ))}
          {showNewFolder ? (
            <form onSubmit={handleCreateFolder} style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
              <input
                autoFocus
                style={s.folderNameInput}
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Nom…"
                onBlur={() => { if (!newFolderName.trim()) setShowNewFolder(false); }}
              />
              <button type="submit" style={s.folderPill(false)}>✓</button>
            </form>
          ) : (
            <button style={s.folderAddBtn} onClick={() => setShowNewFolder(true)} title="Nouveau dossier">
              ＋
            </button>
          )}
        </div>
      )}

      <div
        style={s.sessionList}
        onClick={() => setFolderDropFor(null)}
      >
        {listToShow.map(session => {
          const meta = isCloud ? (convMeta[session.id] || { folder_id: null, tags: [] }) : { folder_id: null, tags: [] };
          const tags = meta.tags || [];

          return (
            <div
              key={session.id}
              style={{ ...s.sessionItem(session.id === currentId), position: 'relative' }}
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

                {/* Tags row */}
                {isCloud && (tags.length > 0 || tagInputFor !== session.id) && (
                  <div style={s.tagsRow} onClick={e => e.stopPropagation()}>
                    {tags.map(tag => (
                      <span
                        key={tag}
                        style={s.tagChip(tagColor(tag))}
                        onClick={() => removeTag(session.id, tag).catch(() => {})}
                        title="Cliquer pour supprimer"
                      >
                        {tag}
                      </span>
                    ))}
                    {tagInputFor !== session.id && (
                      <button
                        style={s.tagAddBtn}
                        onClick={() => { setTagInputFor(session.id); setTagDraft(''); }}
                        title="Ajouter un tag"
                      >
                        +
                      </button>
                    )}
                  </div>
                )}

                {/* Tag input */}
                {isCloud && tagInputFor === session.id && (
                  <form
                    style={s.tagsRow}
                    onSubmit={e => { e.preventDefault(); handleAddTag(session.id); }}
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      autoFocus
                      style={s.tagInput}
                      value={tagDraft}
                      onChange={e => setTagDraft(e.target.value)}
                      placeholder="tag…"
                      onBlur={() => { handleAddTag(session.id); }}
                    />
                  </form>
                )}
              </div>

              {/* Actions: folder picker + delete */}
              <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                {isCloud && searchResults === null && (
                  <div style={{ position: 'relative' }}>
                    <button
                      style={s.folderIconBtn}
                      onClick={() => setFolderDropFor(p => p === session.id ? null : session.id)}
                      title="Déplacer dans un dossier"
                    >
                      📁
                    </button>
                    {folderDropFor === session.id && (
                      <div style={s.folderDropdown}>
                        <div
                          style={s.folderDropItem(!meta.folder_id)}
                          onClick={() => { moveToFolder(session.id, null).catch(() => {}); setFolderDropFor(null); }}
                        >
                          Aucun dossier
                        </div>
                        {folders.map(f => (
                          <div
                            key={f.id}
                            style={s.folderDropItem(meta.folder_id === f.id)}
                            onClick={() => { moveToFolder(session.id, f.id).catch(() => {}); setFolderDropFor(null); }}
                          >
                            📁 {f.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {searchResults === null && (
                  <button
                    style={s.deleteBtn}
                    onClick={() => onDelete(session.id)}
                    title="Supprimer"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {searchResults !== null && searchResults.length === 0 && (
          <div style={{ padding: '16px 10px', color: '#444', fontSize: '12px', textAlign: 'center' }}>
            Aucun résultat
          </div>
        )}
        {isCloud && selectedFolder !== null && listToShow.length === 0 && searchResults === null && (
          <div style={{ padding: '16px 10px', color: '#444', fontSize: '12px', textAlign: 'center' }}>
            Ce dossier est vide
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
