import { useRef, useState, useCallback } from 'react';
import { streamChat } from '../services/api.js';

const MAX_CONTEXT_MESSAGES = 30;

// Encapsule le streaming SSE + parsing tool_start / tool_result / rag_sources / prompt_refined.
// Préserve strictement la sémantique de ChatView : assistantIdxRef + setMessages prev callbacks.
export function useChatStream({ messages, setMessages, onComplete }) {
  const [isStreaming, setIsStreaming] = useState(false);
  const assistantIdxRef = useRef(null);

  const startStream = useCallback(async (newMessages, options = {}) => {
    const {
      promptEngineerEnabled = false,
      ragEnabled = true,
      selectedModel = null,
    } = options;

    setIsStreaming(true);
    const assistantIdx = newMessages.length;
    assistantIdxRef.current = assistantIdx;
    setMessages(prev => [...prev, { role: 'assistant', content: '', tools: [] }]);

    const contextMessages = newMessages.length > MAX_CONTEXT_MESSAGES
      ? newMessages.slice(newMessages.length - MAX_CONTEXT_MESSAGES)
      : newMessages;

    try {
      await streamChat(
        contextMessages,
        // onChunk
        (chunk) => {
          setMessages(prev => {
            const updated = [...prev];
            const idx = assistantIdxRef.current;
            updated[idx] = { ...updated[idx], content: updated[idx].content + chunk };
            return updated;
          });
        },
        // onToolStart
        (name, args) => {
          setMessages(prev => {
            const updated = [...prev];
            const idx = assistantIdxRef.current;
            const msg = { ...updated[idx] };
            msg.tools = [...(msg.tools || []), { name, args, result: null, status: 'running' }];
            updated[idx] = msg;
            return updated;
          });
        },
        // onTool (result)
        (name, result, error) => {
          setMessages(prev => {
            const updated = [...prev];
            const idx = assistantIdxRef.current;
            const msg = { ...updated[idx] };
            const toolIdx = [...msg.tools].reverse().findIndex(t => t.name === name && t.status === 'running');
            const realIdx = toolIdx >= 0 ? msg.tools.length - 1 - toolIdx : -1;
            if (realIdx >= 0) {
              msg.tools = msg.tools.map((t, i) =>
                i === realIdx ? { ...t, result, status: error ? 'error' : 'success' } : t
              );
            }
            updated[idx] = msg;
            return updated;
          });
        },
        // onDone
        () => {
          setIsStreaming(false);
          if (onComplete) {
            setMessages(prev => {
              const lastMsg = prev[assistantIdxRef.current];
              if (lastMsg?.role === 'assistant' && lastMsg.content) {
                onComplete(lastMsg.content);
              }
              return prev;
            });
          }
        },
        promptEngineerEnabled,
        // onPromptRefined
        () => {
          setMessages(prev => {
            const updated = [...prev];
            const userIdx = assistantIdxRef.current - 1;
            if (userIdx >= 0) {
              updated[userIdx] = { ...updated[userIdx], refined: true };
            }
            return updated;
          });
        },
        ragEnabled,
        // onRagSources
        (sources) => {
          setMessages(prev => {
            const updated = [...prev];
            const userIdx = assistantIdxRef.current - 1;
            if (userIdx >= 0) {
              updated[userIdx] = { ...updated[userIdx], ragSources: sources };
            }
            return updated;
          });
        },
        selectedModel,
      );
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        const idx = assistantIdxRef.current;
        updated[idx] = { ...updated[idx], content: `Erreur : ${err.message}` };
        return updated;
      });
      setIsStreaming(false);
    }
  }, [setMessages, onComplete]);

  return { isStreaming, setIsStreaming, startStream };
}
