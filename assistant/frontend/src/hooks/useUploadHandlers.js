import { useState } from 'react';
import { uploadFile, confirmDocument } from '../services/api.js';

// Handlers d'upload : sélection fichier, confirmation IPCRA, annulation.
// Pilote la liste de messages via setMessages (insère user + assistant uploadProposal).
export function useUploadHandlers({ messages, setMessages, isStreaming }) {
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file || isStreaming || isUploading) return;
    e.target.value = '';
    const proposalId = crypto.randomUUID();
    setIsUploading(true);
    setMessages(prev => [
      ...prev,
      { role: 'user', content: `📎 **${file.name}**` },
      { role: 'assistant', content: '', uploadProposal: { _id: proposalId, status: 'loading', filename: file.name } },
    ]);
    try {
      const result = await uploadFile(file);
      setMessages(prev => prev.map(m =>
        m.uploadProposal?._id === proposalId
          ? { ...m, uploadProposal: { _id: proposalId, status: 'pending', ...result } }
          : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.uploadProposal?._id === proposalId
          ? { ...m, content: `Erreur lors de l'analyse : ${err.message}`, uploadProposal: undefined }
          : m
      ));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleUploadConfirm(proposalId, wing, room) {
    const msg = messages.find(m => m.uploadProposal?._id === proposalId);
    if (!msg) return;
    const { file_id, filename, summary } = msg.uploadProposal;
    await confirmDocument({ file_id, filename, wing, room, summary });
    setMessages(prev => prev.map(m =>
      m.uploadProposal?._id === proposalId
        ? { ...m, uploadProposal: { ...m.uploadProposal, status: 'confirmed', final_wing: wing, final_room: room } }
        : m
    ));
  }

  function handleUploadCancel(proposalId) {
    setMessages(prev => prev.map(m =>
      m.uploadProposal?._id === proposalId
        ? { ...m, uploadProposal: { ...m.uploadProposal, status: 'cancelled' } }
        : m
    ));
  }

  return { isUploading, handleFileSelect, handleUploadConfirm, handleUploadCancel };
}
