import { useState, useEffect, useCallback } from 'react';
import {
  listFolders,
  listConversationsCloud,
  createFolder as apiCreateFolder,
  deleteFolder as apiDeleteFolder,
  setConversationFolder as apiSetFolder,
  addConversationTag as apiAddTag,
  removeConversationTag as apiRemoveTag,
} from '../services/api.js';

// Manages folder list + per-conversation metadata (folder_id, tags).
// Only active in cloud storage mode.
export function useFolders({ storageMode }) {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [convMeta, setConvMeta] = useState({}); // { [convId]: { folder_id, tags } }

  const refresh = useCallback(async () => {
    if (storageMode !== 'cloud') {
      setFolders([]);
      setConvMeta({});
      return;
    }
    const [fols, convs] = await Promise.all([listFolders(), listConversationsCloud()]);
    setFolders(fols);
    const meta = {};
    for (const c of convs) meta[c.id] = { folder_id: c.folder_id ?? null, tags: c.tags || [] };
    setConvMeta(meta);
  }, [storageMode]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const createFolder = useCallback(async (name) => {
    const folder = await apiCreateFolder(name);
    setFolders(prev => [...prev, folder]);
    return folder;
  }, []);

  const removeFolder = useCallback(async (id) => {
    await apiDeleteFolder(id);
    setFolders(prev => prev.filter(f => f.id !== id));
    setSelectedFolder(prev => prev === id ? null : prev);
    setConvMeta(prev => {
      const next = { ...prev };
      for (const cid in next) {
        if (next[cid].folder_id === id) next[cid] = { ...next[cid], folder_id: null };
      }
      return next;
    });
  }, []);

  const moveToFolder = useCallback(async (convId, folderId) => {
    await apiSetFolder(convId, folderId);
    setConvMeta(prev => ({
      ...prev,
      [convId]: { ...(prev[convId] || { tags: [] }), folder_id: folderId },
    }));
  }, []);

  const addTag = useCallback(async (convId, tag) => {
    const clean = tag.toLowerCase().trim();
    if (!clean) return;
    await apiAddTag(convId, clean);
    setConvMeta(prev => ({
      ...prev,
      [convId]: {
        ...(prev[convId] || { folder_id: null }),
        tags: [...new Set([...(prev[convId]?.tags || []), clean])],
      },
    }));
  }, []);

  const removeTag = useCallback(async (convId, tag) => {
    await apiRemoveTag(convId, tag);
    setConvMeta(prev => ({
      ...prev,
      [convId]: {
        ...(prev[convId] || { folder_id: null }),
        tags: (prev[convId]?.tags || []).filter(t => t !== tag),
      },
    }));
  }, []);

  return {
    folders,
    selectedFolder,
    setSelectedFolder,
    convMeta,
    createFolder,
    removeFolder,
    moveToFolder,
    addTag,
    removeTag,
  };
}
