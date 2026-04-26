import { useState, useEffect, createContext, useContext } from 'react'
import keycloak from '../keycloak'

const AuthContext = createContext(null)

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [matrixCreds, setMatrixCreds] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Guard StrictMode double-invoke
    if (typeof keycloak.authenticated !== 'undefined') {
      if (keycloak.authenticated) _fetchMe()
      else setLoading(false)
      return
    }

    keycloak
      .init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
      .then((authenticated) => { if (authenticated) return _fetchMe() })
      .catch(() => setLoading(false))

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => keycloak.logout())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function _fetchMe() {
    try {
      const r = await fetch(`${BASE}/api/auth/me`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${keycloak.token}` },
      })
      if (!r.ok) { keycloak.logout(); return }
      const data = await r.json()
      setUser(data.user)
      if (data.matrix_user_id) {
        setMatrixCreds({ userId: data.matrix_user_id, accessToken: data.matrix_access_token })
      }
    } catch {
      keycloak.logout()
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('oria_user')
    localStorage.removeItem('matrix_user_id')
    localStorage.removeItem('matrix_token')
    keycloak.logout({ redirectUri: window.location.origin })
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, keycloak, matrixCreds }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
