import { useEffect } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import MainLayout from './components/MainLayout.jsx'
import { initMatrixClient, startMatrixClient, stopMatrixClient } from './services/matrixClient.js'

function AppInner() {
  const { user, loading, logout, matrixCreds } = useAuth()

  useEffect(() => {
    if (!matrixCreds?.userId || !matrixCreds?.accessToken) return
    localStorage.setItem('matrix_user_id', matrixCreds.userId)
    localStorage.setItem('matrix_token',   matrixCreds.accessToken)
    initMatrixClient({ userId: matrixCreds.userId, accessToken: matrixCreds.accessToken })
    startMatrixClient().catch(console.error)
    return () => stopMatrixClient()
  }, [matrixCreds])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6b6b80' }}>
      Chargement…
    </div>
  )

  if (!user) return null // Keycloak redirige automatiquement via login-required

  return <MainLayout moi={user} onMoiUpdate={() => {}} onDeconnexion={logout} />
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
