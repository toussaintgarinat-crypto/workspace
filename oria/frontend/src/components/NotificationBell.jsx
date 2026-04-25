import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api.js'

export default function NotificationBell() {
  const [count, setCount]     = useState(0)
  const [open, setOpen]       = useState(false)
  const [notifs, setNotifs]   = useState([])
  const panelRef              = useRef(null)

  useEffect(() => {
    fetchCount()
    const id = setInterval(fetchCount, 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!open) return
    function onOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  async function fetchCount() {
    const data = await api.get('/social/notifs/unread-count')
    if (data) setCount(data.count)
  }

  async function openPanel() {
    const data = await api.get('/social/notifs')
    if (data) setNotifs(data)
    setOpen(v => !v)
  }

  async function markAll() {
    await api.patch('/social/notifs/read-all')
    setCount(0)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  function labelNotif(n) {
    if (n.type === 'new_follower') {
      return `${n.data.follower_avatar} ${n.data.follower_nom} te suit maintenant`
    }
    if (n.type === 'new_world_public') {
      return `${n.data.owner_avatar} ${n.data.owner_nom} a publié un monde : ${n.data.world_nom}`
    }
    return 'Nouvelle notification'
  }

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button className={`world-btn nav-btn ${open ? 'actif' : ''}`} onClick={openPanel} title="Notifications">
        <span>🔔</span>
        {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
        <span className="world-btn-tooltip">Notifications</span>
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>Notifications</span>
            {count > 0 && <button className="notif-mark-all" onClick={markAll}>Tout lire</button>}
          </div>
          {notifs.length === 0 ? (
            <div className="notif-empty">Aucune notification</div>
          ) : (
            <ul className="notif-list">
              {notifs.map(n => (
                <li key={n.id} className={`notif-item ${n.read ? 'read' : 'unread'}`}>
                  <span className="notif-dot" />
                  <span className="notif-text">{labelNotif(n)}</span>
                  <span className="notif-time">{new Date(n.created_at).toLocaleDateString('fr')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
