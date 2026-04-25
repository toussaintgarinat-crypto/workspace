import { useState, useEffect } from 'react'
import { api } from '../services/api.js'

export default function ActivityFeed({ moi, onOuvrirWorld }) {
  const [feed, setFeed]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [following, setFollowing] = useState([])

  useEffect(() => {
    fetchFeed()
    fetchFollowing()
  }, [])

  async function fetchFeed() {
    setLoading(true)
    const data = await api.get('/social/feed')
    setFeed(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchFollowing() {
    const data = await api.get('/social/following')
    setFollowing(Array.isArray(data) ? data : [])
  }

  async function unfollow(userId) {
    await api.del(`/social/follow/${userId}`)
    setFollowing(prev => prev.filter(u => u.id !== userId))
    fetchFeed()
  }

  return (
    <div className="activity-feed">
      <div className="feed-header">
        <h2>🌊 Fil d'activité</h2>
        <p className="feed-subtitle">Worlds publics des personnes que tu suis</p>
      </div>

      <div className="feed-layout">
        {/* Colonne gauche : following */}
        <div className="feed-following-panel">
          <h3>Tu suis ({following.length})</h3>
          {following.length === 0 ? (
            <p className="feed-empty-hint">Suis des utilisateurs depuis la page Explorer</p>
          ) : (
            <ul className="following-list">
              {following.map(u => (
                <li key={u.id} className="following-item">
                  <span className="following-avatar">{u.avatar_emoji}</span>
                  <span className="following-nom">{u.nom}</span>
                  <button className="btn-unfollow" onClick={() => unfollow(u.id)} title="Ne plus suivre">✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Colonne droite : feed */}
        <div className="feed-main">
          {loading ? (
            <div className="feed-loading"><div className="spinner" /><p>Chargement…</p></div>
          ) : feed.length === 0 ? (
            <div className="feed-empty">
              <span>🌱</span>
              <p>Ton fil est vide pour l'instant.</p>
              <small>Suis des utilisateurs pour voir leurs worlds publics ici.</small>
            </div>
          ) : (
            <div className="feed-items">
              {feed.map((item, i) => (
                <FeedCard key={i} item={item} onOuvrirWorld={onOuvrirWorld} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FeedCard({ item, onOuvrirWorld }) {
  return (
    <div className="feed-card" onClick={() => onOuvrirWorld?.(item.world_id)}>
      <div className="feed-card-banner" style={{ background: item.world_couleur }}>
        <span className="feed-card-emoji">{item.world_emoji}</span>
      </div>
      <div className="feed-card-body">
        <div className="feed-card-owner">
          <span>{item.owner_avatar}</span>
          <span className="feed-card-owner-nom">{item.owner_nom}</span>
          <span className="feed-card-date">{new Date(item.created_at).toLocaleDateString('fr')}</span>
        </div>
        <h4 className="feed-card-nom">{item.world_nom}</h4>
        {item.world_desc && <p className="feed-card-desc">{item.world_desc}</p>}
      </div>
    </div>
  )
}
