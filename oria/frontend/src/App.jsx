import { useState, useEffect } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import MainLayout from './components/MainLayout.jsx'
import PortailCitoyen from './components/PortailCitoyen.jsx'
import { initMatrixClient, startMatrixClient, stopMatrixClient } from './services/matrixClient.js'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const REFRESH_SEUIL_JOURS = 7

export default function App() {
  // Optimistic initial state from profile cache — cookie handles actual auth
  const [moi, setMoi] = useState(() => {
    try { return JSON.parse(localStorage.getItem('oria_user') || 'null') } catch { return null }
  })

  useEffect(() => {
    // Re-initialize Matrix if credentials are cached
    const matrixUserId = localStorage.getItem('matrix_user_id')
    const matrixToken  = localStorage.getItem('matrix_token')
    if (matrixUserId && matrixToken) {
      const client = initMatrixClient({ userId: matrixUserId, accessToken: matrixToken })
      startMatrixClient().catch(console.error)
      void client
    }

    // Verify cookie session on mount (raw fetch — 401 is expected when not logged in)
    fetch(`${BASE}/api/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          setMoi(data.user)
          localStorage.setItem('oria_user', JSON.stringify(data.user))
          _maybeRefresh()
        } else {
          // Cookie expired or absent — clear cached profile
          setMoi(null)
          localStorage.removeItem('oria_user')
          localStorage.removeItem('oria_session_exp')
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function _maybeRefresh() {
    const expStr = localStorage.getItem('oria_session_exp')
    if (!expStr) return
    const joursRestants = (parseInt(expStr) - Date.now()) / (1000 * 60 * 60 * 24)
    if (joursRestants > REFRESH_SEUIL_JOURS) return

    fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          setMoi(data.user)
          localStorage.setItem('oria_user', JSON.stringify(data.user))
          localStorage.setItem('oria_session_exp', String(Date.now() + 30 * 24 * 60 * 60 * 1000))
        }
      })
      .catch(() => {})
  }

  async function connecter({ user, matrix_user_id, matrix_access_token }) {
    localStorage.setItem('oria_user', JSON.stringify(user))
    localStorage.setItem('oria_session_exp', String(Date.now() + 30 * 24 * 60 * 60 * 1000))

    if (matrix_user_id && matrix_access_token) {
      localStorage.setItem('matrix_user_id', matrix_user_id)
      localStorage.setItem('matrix_token',   matrix_access_token)
      initMatrixClient({ userId: matrix_user_id, accessToken: matrix_access_token })
      startMatrixClient().catch(console.error)
    }

    setMoi(user)
  }

  function deconnecter() {
    localStorage.removeItem('oria_user')
    localStorage.removeItem('oria_session_exp')
    localStorage.removeItem('matrix_user_id')
    localStorage.removeItem('matrix_token')
    stopMatrixClient()
    fetch(`${BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
    setMoi(null)
  }

  // Portail public citoyen (/portail?commune=WORLD_ID)
  const isPortail = window.location.pathname === '/portail' || window.location.pathname.startsWith('/portail/')
  if (isPortail) {
    const params = new URLSearchParams(window.location.search)
    const communeId = params.get('commune')
    return <PortailCitoyen communeId={communeId} />
  }

  if (!moi) return <LoginScreen onConnexion={connecter} />
  return <MainLayout moi={moi} onMoiUpdate={setMoi} onDeconnexion={deconnecter} />
}
