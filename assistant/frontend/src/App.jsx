import { useState } from 'react';
import ChatView from './views/ChatView.jsx';
import ConnectView from './views/ConnectView.jsx';
import GatewayView from './views/GatewayView.jsx';
import MemoryView from './views/MemoryView.jsx';
import SwarmView from './views/SwarmView.jsx';
import VoiceView from './views/VoiceView.jsx';

const s = {
  layout: {
    display: 'flex',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    background: '#0f0f0f',
  },
  sidebar: {
    width: '56px',
    background: '#1a1a1a',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 0',
    gap: '4px',
    flexShrink: 0,
  },
  logo: {
    width: '32px',
    height: '32px',
    background: '#7c3aed',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    marginBottom: '16px',
    flexShrink: 0,
  },
  navBtn: (active) => ({
    width: '40px',
    height: '40px',
    border: 'none',
    borderRadius: '8px',
    background: active ? '#7c3aed22' : 'transparent',
    color: active ? '#7c3aed' : '#6b6b6b',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    transition: 'background 0.15s, color 0.15s',
    flexShrink: 0,
  }),
  main: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
};

export default function App() {
  const [view, setView] = useState('chat');

  return (
    <div style={s.layout}>
      <nav style={s.sidebar}>
        <div style={s.logo} title="Assistant">✦</div>
        <button
          style={s.navBtn(view === 'chat')}
          onClick={() => setView('chat')}
          title="Chat"
        >
          💬
        </button>
        <button
          style={s.navBtn(view === 'connections')}
          onClick={() => setView('connections')}
          title="Connexions"
        >
          🔗
        </button>
        <button
          style={s.navBtn(view === 'gateway')}
          onClick={() => setView('gateway')}
          title="Gateway IA"
        >
          ⚡
        </button>
        <button
          style={s.navBtn(view === 'memory')}
          onClick={() => setView('memory')}
          title="Mémoire"
        >
          🧠
        </button>
        <button
          style={s.navBtn(view === 'swarm')}
          onClick={() => setView('swarm')}
          title="Swarm Mode"
        >
          🤖
        </button>
        <button
          style={s.navBtn(view === 'voice')}
          onClick={() => setView('voice')}
          title="Voice I/O"
        >
          🎙️
        </button>
      </nav>
      <main style={s.main}>
        {view === 'chat' && <ChatView />}
        {view === 'connections' && <ConnectView />}
        {view === 'gateway' && <GatewayView />}
        {view === 'memory' && <MemoryView />}
        {view === 'swarm' && <SwarmView />}
        {view === 'voice' && <VoiceView />}
      </main>
    </div>
  );
}
