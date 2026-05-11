import { useState, useEffect, useCallback } from 'react';
import { getVaultTokens, storeVaultToken, deleteVaultToken, oauthCallback } from '../services/api.js';

const APPS = [
  {
    type: 'forge',
    label: 'Forge',
    icon: '⚡',
    desc: 'Workspace IA, ventures, analytics',
    keycloak: { realm: 'forge', clientId: 'forge-app' },
  },
  {
    type: 'oria',
    label: 'Oria',
    icon: '🌍',
    desc: 'Mondes, bâtiments, pièces',
    keycloak: { realm: 'forge', clientId: 'forge-app' },
  },
  {
    type: 'mempalace',
    label: 'MemPalace',
    icon: '🧠',
    desc: 'Mémoire vectorielle IPCRA',
    keycloak: null,
  },
];

const KEYCLOAK_BASE = 'http://localhost:8080';
const ASSISTANT_BASE = 'http://localhost:8300';

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(hash) };
}

const s = {
  wrap:     { height: '100%', overflowY: 'auto', padding: '28px 32px' },
  h1:       { fontSize: '18px', fontWeight: '600', color: '#e8e8e8', marginBottom: '6px' },
  sub:      { fontSize: '13px', color: '#6b6b6b', marginBottom: '28px' },
  grid:     { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '560px' },
  card:     { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '20px' },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  left:     { display: 'flex', alignItems: 'center', gap: '10px' },
  icon:     { fontSize: '22px' },
  label:    { fontSize: '15px', fontWeight: '500', color: '#e8e8e8' },
  appDesc:  { fontSize: '12px', color: '#6b6b6b', marginTop: '1px' },
  badge: ok => ({
    padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500',
    background: ok ? '#10b98122' : '#2a2a2a',
    color: ok ? '#10b981' : '#6b6b6b',
    border: `1px solid ${ok ? '#10b98144' : '#3a3a3a'}`,
  }),
  field:    { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' },
  label2:   { fontSize: '12px', color: '#888', marginBottom: '2px' },
  input:    {
    background: '#111', border: '1px solid #2a2a2a', borderRadius: '8px',
    padding: '8px 12px', color: '#e8e8e8', fontSize: '13px', width: '100%', boxSizing: 'border-box',
  },
  row:      { display: 'flex', gap: '8px' },
  btn: (variant = 'primary') => ({
    padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
    cursor: 'pointer', border: 'none',
    background: variant === 'primary' ? '#7c3aed' : variant === 'danger' ? '#dc262622' : '#2a2a2a',
    color: variant === 'danger' ? '#dc2626' : '#e8e8e8',
  }),
  err:      { fontSize: '12px', color: '#ef4444', marginTop: '6px' },
  note:     { fontSize: '12px', color: '#6b6b6b', marginTop: '8px', lineHeight: '1.5' },
};

function MPLoginForm({ onConnected }) {
  const [url, setUrl]   = useState('http://localhost:8100');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr]   = useState('');
  const [loading, setLoading] = useState(false);

  async function login() {
    setErr(''); setLoading(true);
    try {
      const r = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: user, password: pass }),
      });
      const data = await r.json();
      if (!data.access_token) { setErr(data.detail || 'Échec connexion'); return; }
      await storeVaultToken('mempalace', data.access_token, data.refresh_token);
      onConnected();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={s.field}>
        <span style={s.label2}>URL MemPalace</span>
        <input style={s.input} value={url} onChange={e => setUrl(e.target.value)} />
      </div>
      <div style={s.field}>
        <span style={s.label2}>Nom d'utilisateur</span>
        <input style={s.input} value={user} onChange={e => setUser(e.target.value)} placeholder="forge" />
      </div>
      <div style={s.field}>
        <span style={s.label2}>Mot de passe</span>
        <input style={s.input} type="password" value={pass} onChange={e => setPass(e.target.value)} />
      </div>
      {err && <div style={s.err}>{err}</div>}
      <button style={s.btn()} onClick={login} disabled={loading}>
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </div>
  );
}

function AppCard({ app, connected, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function connectPKCE() {
    setBusy(true);
    const { verifier, challenge } = await generatePKCE();
    const redirectUri = `${ASSISTANT_BASE}/connect`;
    sessionStorage.setItem('pkce_verifier', verifier);
    sessionStorage.setItem('pkce_app', app.type);
    sessionStorage.setItem('pkce_realm', app.keycloak.realm);
    sessionStorage.setItem('pkce_client', app.keycloak.clientId);
    sessionStorage.setItem('pkce_redirect', redirectUri);
    const params = new URLSearchParams({
      client_id: app.keycloak.clientId,
      response_type: 'code',
      scope: 'openid',
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: app.type,
    });
    window.location.href = `${KEYCLOAK_BASE}/realms/${app.keycloak.realm}/protocol/openid-connect/auth?${params}`;
  }

  async function disconnect() {
    setBusy(true);
    await deleteVaultToken(app.type);
    onRefresh();
    setBusy(false);
  }

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <div style={s.left}>
          <span style={s.icon}>{app.icon}</span>
          <div>
            <div style={s.label}>{app.label}</div>
            <div style={s.appDesc}>{app.desc}</div>
          </div>
        </div>
        <span style={s.badge(connected)}>{connected ? '✓ Connecté' : 'Non connecté'}</span>
      </div>

      {!connected && (
        <>
          {app.keycloak ? (
            <div style={s.row}>
              <button style={s.btn()} onClick={connectPKCE} disabled={busy}>
                Connexion via Keycloak
              </button>
            </div>
          ) : (
            <>
              <button style={{ ...s.btn('secondary'), marginBottom: '12px' }} onClick={() => setOpen(v => !v)}>
                {open ? 'Annuler' : 'Entrer les identifiants'}
              </button>
              {open && <MPLoginForm onConnected={() => { setOpen(false); onRefresh(); }} />}
            </>
          )}
          <div style={s.note}>
            {app.keycloak
              ? 'Redirige vers Keycloak pour autoriser l\'accès. Le token est chiffré dans le vault.'
              : 'Connexion directe à l\'API MemPalace. Le token est chiffré AES-256 dans le vault.'}
          </div>
        </>
      )}

      {connected && (
        <button style={s.btn('danger')} onClick={disconnect} disabled={busy}>
          Déconnecter
        </button>
      )}
    </div>
  );
}

export default function ConnectView() {
  const [vault, setVault]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVaultTokens();
      setVault(data || []);
    } catch {
      setVault([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code  = params.get('code');
    const state = params.get('state');

    if (code && state) {
      const verifier    = sessionStorage.getItem('pkce_verifier');
      const realm       = sessionStorage.getItem('pkce_realm');
      const clientId    = sessionStorage.getItem('pkce_client');
      const redirectUri = sessionStorage.getItem('pkce_redirect');

      if (verifier) {
        sessionStorage.removeItem('pkce_verifier');
        sessionStorage.removeItem('pkce_app');
        window.history.replaceState({}, '', window.location.pathname);

        oauthCallback(state, { code, code_verifier: verifier, redirect_uri: redirectUri, keycloak_url: KEYCLOAK_BASE, realm, client_id: clientId })
          .then(() => load())
          .catch(() => load());
        return;
      }
    }
    load();
  }, [load]);

  const isConnected = type => vault.some(v => v.app_type === type);

  if (loading) return <div style={{ ...s.wrap, color: '#6b6b6b', paddingTop: '60px', textAlign: 'center' }}>Chargement…</div>;

  return (
    <div style={s.wrap}>
      <div style={s.h1}>Connexions</div>
      <div style={s.sub}>
        Liez vos apps à l'assistant. Les tokens sont chiffrés AES-256 dans le vault local.
      </div>
      <div style={s.grid}>
        {APPS.map(app => (
          <AppCard key={app.type} app={app} connected={isConnected(app.type)} onRefresh={load} />
        ))}
      </div>
    </div>
  );
}
