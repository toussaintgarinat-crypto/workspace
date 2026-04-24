import { useState, useEffect, createContext, useContext } from 'react'
import keycloak from '../keycloak'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Guard against React StrictMode double-invoke (keycloak-js can only be initialized once).
    // keycloak.authenticated is undefined until init() resolves — we must wait if still pending.
    if (keycloak.didInitialize) {
      if (typeof keycloak.authenticated !== 'undefined') {
        // init() already resolved
        if (keycloak.authenticated) {
          const p = keycloak.tokenParsed
          setUser({
            id:          p.sub,
            nom:         p.nom || p.preferred_username || p.name || 'Utilisateur',
            avatarEmoji: p.avatarEmoji || '👤',
            email:       p.email || '',
          })
        }
        setLoading(false)
      } else {
        // init() still in progress — wire callbacks so we respond when it finishes
        keycloak.onAuthSuccess = () => {
          const p = keycloak.tokenParsed
          setUser({
            id:          p.sub,
            nom:         p.nom || p.preferred_username || p.name || 'Utilisateur',
            avatarEmoji: p.avatarEmoji || '👤',
            email:       p.email || '',
          })
          setLoading(false)
        }
        keycloak.onAuthError = () => setLoading(false)
        keycloak.onReady     = () => { if (!keycloak.authenticated) setLoading(false) }
      }
      return
    }

    keycloak
      .init({
        onLoad:      'login-required',
        pkceMethod:  'S256',
        checkLoginIframe: false,
      })
      .then((authenticated) => {
        if (authenticated) {
          const p = keycloak.tokenParsed
          setUser({
            id:          p.sub,
            nom:         p.nom || p.preferred_username || p.name || 'Utilisateur',
            avatarEmoji: p.avatarEmoji || '👤',
            email:       p.email || '',
          })
        }
      })
      .finally(() => setLoading(false))

    // Rafraîchissement automatique du token
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => keycloak.logout())
    }
  }, [])

  function logout() {
    keycloak.logout({ redirectUri: window.location.origin })
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, keycloak }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
