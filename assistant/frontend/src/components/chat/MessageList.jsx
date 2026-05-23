import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';
import { s, SUGGESTIONS } from './styles.js';

export default function MessageList({
  messages,
  isStreaming,
  isEmpty,
  onSuggestion,
  onUploadConfirm,
  onUploadCancel,
  onOpenArtifact,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isEmpty) {
    return (
      <div style={s.emptyState}>
        <p style={s.emptyTitle}>Bonjour, comment puis-je vous aider ?</p>
        <div style={s.suggestions}>
          {SUGGESTIONS.map((sug) => (
            <button key={sug} style={s.suggestionBtn} onClick={() => onSuggestion(sug)}>
              {sug}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={s.messageList}>
      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          msg={msg}
          onUploadConfirm={msg.uploadProposal?.status === 'pending'
            ? (wing, room) => onUploadConfirm(msg.uploadProposal._id, wing, room)
            : undefined}
          onUploadCancel={msg.uploadProposal?.status === 'pending'
            ? () => onUploadCancel(msg.uploadProposal._id)
            : undefined}
          onOpenArtifact={onOpenArtifact}
        />
      ))}
      {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
        <div style={s.streamingDots}>
          <span className="streaming-dots">
            <span>●</span><span>●</span><span>●</span>
          </span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
