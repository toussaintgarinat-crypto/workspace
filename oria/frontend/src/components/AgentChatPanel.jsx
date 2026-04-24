import { useState, useRef, useEffect } from 'react'
import { api } from '../services/api.js'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function AgentChatPanel({ agent, moi, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'agent',
      content: `Bonjour ! Je suis **${agent.nom}**. ${agent.description ? agent.description + ' ' : ''}Comment puis-je t'aider ?`,
      timestamp: new Date().toISOString(),
    }
  ])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sessionId]             = useState(`oria-${moi?.id}-${agent.id}-${Date.now()}`)
  const [mode, setMode]         = useState('chat')  // 'chat' | 'ipcra'
  const bottomRef               = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setMessages(prev => [...prev, {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }])
    setLoading(true)

    // Essai streaming d'abord, fallback sur simple
    try {
      const token = localStorage.getItem('oria_token')
      const res = await fetch(`${BASE}/api/agents/${agent.id}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      })

      if (res.ok && res.headers.get('content-type')?.includes('event-stream')) {
        // Streaming SSE
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let answer = ''
        let msgId = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            try {
              const data = JSON.parse(line.slice(5))
              if (data.type === 'answer' || data.content) {
                answer += (data.content || data.answer || '')
                setMessages(prev => {
                  if (msgId === null) {
                    msgId = Date.now()
                    return [...prev, { role: 'agent', content: answer, timestamp: new Date().toISOString(), id: msgId }]
                  }
                  return prev.map(m => m.id === msgId ? { ...m, content: answer } : m)
                })
              }
            } catch {}
          }
        }
        if (!answer) throw new Error('empty')
      } else {
        throw new Error('no-stream')
      }
    } catch {
      // Fallback non-streaming
      const data = await api.post(`/agents/${agent.id}/chat/simple`, {
        message: text,
        session_id: sessionId,
      })
      setMessages(prev => [...prev, {
        role: 'agent',
        content: data?.answer || '[Aucune réponse]',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }

  function renderContent(text) {
    // Rendu markdown basique
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className="agent-chat-overlay">
      <div className="agent-chat-panel">
        {/* Header */}
        <div className="agent-chat-header">
          <div className="agent-chat-identity">
            <span className="agent-chat-avatar">{agent.avatar_emoji}</span>
            <div>
              <div className="agent-chat-nom">{agent.nom}</div>
              <div className="agent-chat-desc">{agent.description || 'Agent IA'}</div>
            </div>
          </div>
          <div className="agent-chat-actions">
            <div className="agent-chat-tabs">
              <button
                className={`tab-btn ${mode === 'chat' ? 'active' : ''}`}
                onClick={() => setMode('chat')}
              >💬 Chat</button>
              {agent.use_ipcra && (
                <button
                  className={`tab-btn ${mode === 'ipcra' ? 'active' : ''}`}
                  onClick={() => setMode('ipcra')}
                >🎯 IPCRA</button>
              )}
            </div>
            <button className="agent-chat-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Capacités badges */}
        <div className="agent-capabilities">
          {agent.can_read_docs && <span className="cap-badge">📁 Dossiers</span>}
          {agent.use_memory    && <span className="cap-badge">🧠 Mémoire</span>}
          {agent.use_ipcra     && <span className="cap-badge">🎯 IPCRA</span>}
          <span className="cap-badge forge">⚡ Forge</span>
        </div>

        {/* Messages */}
        <div className="agent-chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role}`}>
              {msg.role === 'agent' && (
                <span className="msg-avatar">{agent.avatar_emoji}</span>
              )}
              <div
                className="msg-bubble"
                dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
              />
              {msg.role === 'user' && (
                <span className="msg-avatar user">{moi?.avatar_emoji || '🧑'}</span>
              )}
            </div>
          ))}
          {loading && (
            <div className="chat-msg agent">
              <span className="msg-avatar">{agent.avatar_emoji}</span>
              <div className="msg-bubble typing">
                <span/>
                <span/>
                <span/>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <form className="agent-chat-input" onSubmit={sendMessage}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Message ${agent.nom}…`}
            disabled={loading}
            autoFocus
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? '⏳' : '↑'}
          </button>
        </form>
      </div>
    </div>
  )
}
