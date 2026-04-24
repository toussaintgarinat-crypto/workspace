import { useState, useEffect } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import MainLayout from './components/MainLayout.jsx'
import PortailCitoyen from './components/PortailCitoyen.jsx'
import { initMatrixClient, startMatrixClient, stopMatrixClient } from './services/matrixClient.js'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const REFRESH_SEUIL_JOURS = 7  // renouveler si < 7 jours avant expiration

// Décode le payload JWT (base64) sans vérification côté client
function decodeToken(token) {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload))
    return { id: decoded.sub, nom: decoded.nom, avatar_emoji: decoded.avatar_emoji, exp: decoded.exp }
  } catch {
    return null
  }
}

function joursAvantExpiration(token) {
  const decoded = decodeToken(token)
  if (!decoded?.exp) return null
  const msRestants = decoded.exp * 1000 - Date.now()
  return msRestants / (1000 * 60 * 60 * 24)
}

export default function App() {
  const [moi, setMoi] = useState(() => {
    const token = localStorage.getItem('oria_token')
    if (!token) return null

    // Ré-initialiser le client Matrix si les credentials sont en localStorage
    const matrixUserId    = localStorage.getItem('matrix_user_id')
    const matrixToken     = localStorage.getItem('matrix_token')
    if (matrixUserId && matrixToken) {
      const client = initMatrixClient({ userId: matrixUserId, accessToken: matrixToken })
      startMatrixClient().catch(console.error)
      void client // évite le warning lint unused
    }

    const user = decodeToken(token)
    return user ? { id: user.id, nom: user.nom, avatar_emoji: user.avatar_emoji } : null
  })

  // Refresh silencieux si le token expire dans moins de REFRESH_SEUIL_JOURS jours
  useEffect(() => {
    const token = localStorage.getItem('oria_token')
    if (!token || !moi) return
    const jours = joursAvantExpiration(token)
    if (jours === null || jours > REFRESH_SEUIL_JOURS) return

    fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.token) {
          localStorage.setItem('oria_token', data.token)
          setMoi(data.user)
        }
      })
      .catch(() => {}) // silencieux — pas de déconnexion si le refresh échoue
  }, []) // une seule fois au montage

  async function connecter({ token, user, matrix_user_id, matrix_access_token }) {
    localStorage.setItem('oria_token', token)

    // Stocker et initialiser Matrix si le backend a retourné les credentials
    if (matrix_user_id && matrix_access_token) {
      localStorage.setItem('matrix_user_id', matrix_user_id)
      localStorage.setItem('matrix_token',   matrix_access_token)
      initMatrixClient({ userId: matrix_user_id, accessToken: matrix_access_token })
      // Démarrage non-bloquant — la synchro se fait en arrière-plan
      startMatrixClient().catch(console.error)
    }

    setMoi(user)
  }

  function deconnecter() {
    localStorage.removeItem('oria_token')
    localStorage.removeItem('matrix_user_id')
    localStorage.removeItem('matrix_token')
    stopMatrixClient()
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
