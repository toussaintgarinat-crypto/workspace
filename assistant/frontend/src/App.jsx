import { useState, useEffect } from 'react';
import { isEnabled, getUser, logout } from './services/keycloak.js';
import { registerServiceWorker, isPushSupported, requestPushPermission } from './services/push.js';
import InstallBanner from './components/InstallBanner.jsx';
import DegradedBanner from './components/DegradedBanner.jsx';
import ChatView from './views/ChatView.jsx';
import ConnectView from './views/ConnectView.jsx';
import GatewayView from './views/GatewayView.jsx';
import MemoryView from './views/MemoryView.jsx';
import SwarmView from './views/SwarmView.jsx';
import VoiceView from './views/VoiceView.jsx';
import AlertsView from './views/AlertsView.jsx';
import AdminView from './views/AdminView.jsx';
import PersonaView from './views/PersonaView.jsx';
import ScheduledView from './views/ScheduledView.jsx';

const API = import.meta.env.VITE_API_URL || '/api';

const isAdmin = () =>
  !isEnabled() || (getUser()?.realm_access?.roles ?? []).includes('admin');

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
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    registerServiceWorker().then(reg => {
      if (reg && isPushSupported() && Notification.permission === 'granted') {
        requestPushPermission();
      }
    });
  }, []);

  useEffect(() => {
    const es = new EventSource(`${API}/proactive/alerts/stream`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'init' || data.type === 'badge_update') {
          setUnreadAlerts(data.unread_count ?? 0);
        } else if (data.type === 'alert') {
          setUnreadAlerts(prev => prev + 1);
        }
      } catch {}
    };
    return () => es.close();
  }, []);

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
        <button
          style={{ ...s.navBtn(view === 'alerts'), position: 'relative' }}
          onClick={() => setView('alerts')}
          title="Alertes proactives"
        >
          🔔
          {unreadAlerts > 0 && (
            <span style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: '#7c3aed',
              color: '#fff',
              fontSize: '9px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}>
              {unreadAlerts > 9 ? '9+' : unreadAlerts}
            </span>
          )}
        </button>
        <button
          style={s.navBtn(view === 'persona')}
          onClick={() => setView('persona')}
          title="Mon profil"
        >
          🎭
        </button>
        <button
          style={s.navBtn(view === 'scheduled')}
          onClick={() => setView('scheduled')}
          title="Prompts planifiés"
        >
          ⏰
        </button>
        {isAdmin() && (
          <button
            style={{ ...s.navBtn(view === 'admin'), marginTop: isEnabled() ? undefined : 'auto' }}
            onClick={() => setView('admin')}
            title="Admin"
          >
            ⚙
          </button>
        )}
        {isEnabled() && (
          <button
            style={{ ...s.navBtn(false), marginTop: 'auto' }}
            onClick={logout}
            title={`Déconnexion — ${getUser()?.preferred_username ?? ''}`}
          >
            👤
          </button>
        )}
      </nav>
      <main style={s.main}>
        <DegradedBanner />
        {view === 'chat' && <ChatView />}
        {view === 'connections' && <ConnectView />}
        {view === 'gateway' && <GatewayView />}
        {view === 'memory' && <MemoryView />}
        {view === 'swarm' && <SwarmView />}
        {view === 'voice' && <VoiceView />}
        {view === 'alerts' && <AlertsView />}
        {view === 'admin' && <AdminView />}
        {view === 'persona' && <PersonaView />}
        {view === 'scheduled' && <ScheduledView />}
      </main>
      <InstallBanner />
    </div>
  );
}
