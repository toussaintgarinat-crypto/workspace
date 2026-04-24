export default function WorldSidebar({
  worlds, worldActifId, moi,
  onSelectWorld, onCreerWorld, onDeconnexion, onNetwork, showNetwork, onSettings,
  // Nouvelles actions
  onDiscovery, showDiscovery,
  onMyDocs, showMyDocs,
  onMap, showMap,
  onAgents, showAgents,
  onIPCRA, showIPCRA,
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">🌐</div>
      <div className="sidebar-divider" />

      <div className="sidebar-worlds">
        {worlds.map(w => (
          <button
            key={w.id}
            className={`world-btn ${worldActifId === w.id ? 'actif' : ''}`}
            onClick={() => onSelectWorld(w.id)}
            title={w.nom}
            style={{ '--couleur': w.couleur }}
          >
            <span className="world-btn-emoji">{w.emoji}</span>
            <span className="world-btn-tooltip">{w.nom}</span>
          </button>
        ))}
      </div>

      <button className="world-btn add" onClick={onCreerWorld} title="Créer un monde">
        <span>＋</span>
        <span className="world-btn-tooltip">Nouveau monde</span>
      </button>

      <div className="sidebar-divider" />

      {/* Navigation globale */}
      <button
        className={`world-btn nav-btn ${showDiscovery ? 'actif' : ''}`}
        onClick={onDiscovery}
        title="Explorer"
      >
        <span>🔭</span>
        <span className="world-btn-tooltip">Explorer les mondes</span>
      </button>

      <button
        className={`world-btn nav-btn ${showMap ? 'actif' : ''}`}
        onClick={onMap}
        title="Carte 2D"
      >
        <span>🗺</span>
        <span className="world-btn-tooltip">Carte du monde</span>
      </button>

      <button
        className={`world-btn nav-btn ${showAgents ? 'actif' : ''}`}
        onClick={onAgents}
        title="Agents IA"
      >
        <span>🤖</span>
        <span className="world-btn-tooltip">Agents IA</span>
      </button>

      <button
        className={`world-btn nav-btn ${showMyDocs ? 'actif' : ''}`}
        onClick={onMyDocs}
        title="Mes dossiers"
      >
        <span>📁</span>
        <span className="world-btn-tooltip">Mes dossiers</span>
      </button>

      <button
        className={`world-btn nav-btn ${showIPCRA ? 'actif' : ''}`}
        onClick={onIPCRA}
        title="IPCRA"
      >
        <span>🎯</span>
        <span className="world-btn-tooltip">Sessions IPCRA</span>
      </button>

      <button
        className={`world-btn network-btn ${showNetwork ? 'actif' : ''}`}
        onClick={onNetwork}
        title="Réseau"
      >
        <span>🏘</span>
        <span className="world-btn-tooltip">Réseau</span>
      </button>

      <div className="sidebar-bottom">
        <div className="sidebar-divider" />
        <button className="moi-btn" onClick={onSettings} title="Paramètres">
          <span>{moi.avatar_emoji}</span>
        </button>
      </div>
    </div>
  )
}
