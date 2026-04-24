import { useState, useEffect } from 'react'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TYPES = { travaux: '🔨 Travaux', permis: '📋 Permis', nuisance: '⚠️ Nuisance', autre: '📝 Autre' }
const NOTIF_COLORS = { info: '#4A90D9', alerte: '#FAA61A', urgence: '#F04747' }

export default function PortailCitoyen({ communeId }) {
  const [commune, setCommune] = useState(null)
  const [notifs, setNotifs] = useState([])
  const [form, setForm] = useState({ nom: '', email: '', type: 'autre', titre: '', description: '', lat: '', lng: '' })
  const [envoye, setEnvoye] = useState(false)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    if (!communeId) return
    // Charger infos commune
    fetch(`${BASE}/api/worlds/${communeId}`).then(r => r.json()).then(d => setCommune(d)).catch(() => {})
    // Charger notifications actives
    fetch(`${BASE}/api/notifs/world/${communeId}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setNotifs(d) }).catch(() => {})
  }, [communeId])

  function geoLocaliser() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setForm(f => ({ ...f, lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) })),
      () => {}
    )
  }

  async function soumettre(e) {
    e.preventDefault()
    setErreur(null)
    try {
      const r = await fetch(`${BASE}/api/tickets/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, world_id: communeId }),
      })
      if (r.ok) {
        setEnvoye(true)
      } else {
        const d = await r.json()
        setErreur(d.detail || 'Erreur lors de l\'envoi')
      }
    } catch {
      setErreur('Serveur inaccessible')
    }
  }

  if (!communeId) {
    return (
      <div className="portail-error">
        <h1>🏛 Portail citoyen</h1>
        <p>Aucune commune spécifiée. Utilisez le lien fourni par votre mairie.</p>
      </div>
    )
  }

  return (
    <div className="portail">
      <header className="portail-header">
        <div className="portail-header-inner">
          <span className="portail-emoji">{commune?.emoji || '🏛'}</span>
          <div>
            <h1 className="portail-titre">{commune?.nom || 'Portail citoyen'}</h1>
            <p className="portail-subtitle">Service aux citoyens — Demandes & Signalements</p>
          </div>
        </div>
      </header>

      <div className="portail-body">
        {/* Notifications publiques */}
        {notifs.length > 0 && (
          <section className="portail-section portail-notifs">
            {notifs.map(n => (
              <div key={n.id} className="portail-notif-banner" style={{ borderLeftColor: NOTIF_COLORS[n.type_notif] || '#4A90D9' }}>
                <strong>{n.type_notif === 'urgence' ? '🚨' : n.type_notif === 'alerte' ? '⚠️' : 'ℹ️'} {n.titre}</strong>
                <p>{n.contenu}</p>
              </div>
            ))}
          </section>
        )}

        <section className="portail-section portail-form-section">
          <h2>📮 Soumettre une demande ou un signalement</h2>

          {envoye ? (
            <div className="portail-success">
              <span>✅</span>
              <div>
                <strong>Demande envoyée !</strong>
                <p>Votre demande a bien été transmise à la mairie. Vous recevrez une réponse par email.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={soumettre} className="portail-form">
              {erreur && <div className="portail-erreur">{erreur}</div>}
              <div className="portail-form-row">
                <label>Votre nom <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required placeholder="Jean Dupont" /></label>
                <label>Email <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="jean@exemple.fr" /></label>
              </div>
              <label>Type de demande
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>Titre de votre demande <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} required placeholder="Ex: Nid de poule rue du Moulin" /></label>
              <label>Description <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} placeholder="Décrivez votre demande en détail..." /></label>
              <div className="portail-geo-row">
                <button type="button" className="portail-btn-geo" onClick={geoLocaliser}>
                  📍 Me localiser
                </button>
                {form.lat && <span className="portail-geo-ok">📌 Position enregistrée ({parseFloat(form.lat).toFixed(4)}, {parseFloat(form.lng).toFixed(4)})</span>}
              </div>
              <button type="submit" className="portail-btn-submit">📤 Envoyer ma demande</button>
            </form>
          )}
        </section>

        <footer className="portail-footer">
          <p>Ce portail est fourni par <strong>Oria Mairie</strong> — Plateforme de communication municipale</p>
        </footer>
      </div>
    </div>
  )
}
