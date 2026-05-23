#!/usr/bin/env bash
# network-chaos.sh — Chaos drill réseau : simulation partition NetBird via iptables
# Nécessite root pour iptables. Si pas root, affiche les instructions manuelles.
# Bloque les connexions vers les pairs NetBird 60s puis vérifie l'auto-reconnect.
set -euo pipefail

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { echo "[OK]  $*"; }
warn() { echo "[WARN] $*"; }
err()  { echo "[ERR] $*" >&2; }

PARTITION_DURATION=60
ASSISTANT_URL="${ASSISTANT_URL:-http://localhost:8300}"
NETBIRD_INTERFACE="${NETBIRD_INTERFACE:-wt0}"

# ── Détection des pairs NetBird ───────────────────────────────
get_netbird_peers() {
    if command -v netbird > /dev/null 2>&1; then
        netbird status 2>/dev/null | grep -E '^  [0-9]+\.' | awk '{print $1}' || echo ""
    elif command -v wg > /dev/null 2>&1; then
        wg show "$NETBIRD_INTERFACE" peers 2>/dev/null | head -5 || echo ""
    else
        echo ""
    fi
}

# ── Mode non-root : instructions manuelles ────────────────────
if [[ $EUID -ne 0 ]]; then
    warn "Ce script nécessite les droits root pour manipuler iptables."
    echo ""
    echo "Instructions manuelles pour simuler une partition réseau NetBird :"
    echo ""
    echo "  1. Bloquer les connexions sortantes vers les pairs NetBird :"
    echo "     sudo iptables -N CHAOS_NET"
    echo "     sudo iptables -A CHAOS_NET -o ${NETBIRD_INTERFACE} -j DROP"
    echo "     sudo iptables -I OUTPUT 1 -j CHAOS_NET"
    echo ""
    echo "  2. Attendre ${PARTITION_DURATION}s pour observer l'impact"
    echo ""
    echo "  3. Vérifier l'état de reconnexion :"
    echo "     netbird status"
    echo ""
    echo "  4. Restaurer les règles iptables :"
    echo "     sudo iptables -D OUTPUT -j CHAOS_NET"
    echo "     sudo iptables -F CHAOS_NET"
    echo "     sudo iptables -X CHAOS_NET"
    echo ""
    echo "  5. Vérifier l'auto-reconnect :"
    echo "     netbird status"
    echo "     curl -sf ${ASSISTANT_URL}/health"
    echo ""
    echo "Alternativement, relancer avec sudo :"
    echo "  sudo bash $(realpath "$0")"
    exit 0
fi

# ── Mode root ─────────────────────────────────────────────────

# Vérifier la présence de l'interface NetBird
if ! ip link show "$NETBIRD_INTERFACE" > /dev/null 2>&1; then
    warn "Interface ${NETBIRD_INTERFACE} introuvable."
    warn "NetBird n'est peut-être pas actif. Essayer wt0, utun0 (macOS), ou définir NETBIRD_INTERFACE=<iface>."
    # Lister les interfaces disponibles
    log "Interfaces réseau disponibles :"
    ip link show | grep -E '^[0-9]+:' | awk '{print "  "$2}' | tr -d ':' || true
fi

log "==> [1/5] État initial NetBird et connectivité"
if command -v netbird > /dev/null 2>&1; then
    log "  netbird status :"
    netbird status 2>/dev/null | head -20 || warn "  netbird status indisponible"
fi

NETBIRD_IPS=()
mapfile -t NETBIRD_IPS < <(get_netbird_peers)
if [[ ${#NETBIRD_IPS[@]} -eq 0 ]]; then
    warn "  Aucun pair NetBird détecté — simulation générique sur l'interface ${NETBIRD_INTERFACE}"
fi

log "  Assistant health avant partition : $(curl -sf --max-time 5 "${ASSISTANT_URL}/health" 2>/dev/null | head -c 100 || echo 'DOWN')"

# ── 2. Activation de la partition ─────────────────────────────
log "==> [2/5] Activation partition réseau NetBird (${PARTITION_DURATION}s)..."

# Chaîne iptables dédiée pour rollback propre
iptables -N CHAOS_NET 2>/dev/null || iptables -F CHAOS_NET

if ip link show "$NETBIRD_INTERFACE" > /dev/null 2>&1; then
    # Bloquer tout trafic sur l'interface NetBird
    iptables -A CHAOS_NET -o "$NETBIRD_INTERFACE" -j DROP
    iptables -A CHAOS_NET -i "$NETBIRD_INTERFACE" -j DROP
    log "  DROP activé sur interface ${NETBIRD_INTERFACE}"
fi

# Bloquer aussi les IPs spécifiques des pairs si disponibles
for peer_ip in "${NETBIRD_IPS[@]}"; do
    iptables -A CHAOS_NET -d "$peer_ip" -j DROP
    iptables -A CHAOS_NET -s "$peer_ip" -j DROP
    log "  DROP activé vers pair ${peer_ip}"
done

iptables -I OUTPUT 1 -j CHAOS_NET
iptables -I INPUT 1 -j CHAOS_NET

log "  Partition activée. Attente ${PARTITION_DURATION}s..."

# ── 3. Vérification pendant la partition ──────────────────────
log "==> [3/5] Vérification impact pendant la partition"
sleep 10

log "  Test connectivité locale (doit rester UP) :"
if curl -sf --max-time 5 "${ASSISTANT_URL}/health" > /dev/null 2>&1; then
    ok "  Assistant local UP pendant la partition (expected)"
else
    warn "  Assistant DOWN pendant la partition (inattendu si local)"
fi

sleep $(( PARTITION_DURATION - 10 ))

# ── 4. Restauration des règles iptables ───────────────────────
log "==> [4/5] Restauration — suppression des règles iptables..."
iptables -D OUTPUT -j CHAOS_NET 2>/dev/null || true
iptables -D INPUT  -j CHAOS_NET 2>/dev/null || true
iptables -F CHAOS_NET 2>/dev/null || true
iptables -X CHAOS_NET 2>/dev/null || true
ok "  Règles iptables supprimées"

# ── 5. Vérification auto-reconnect ───────────────────────────
log "==> [5/5] Vérification auto-reconnect NetBird (attente 15s)..."
sleep 15

if command -v netbird > /dev/null 2>&1; then
    log "  netbird status post-partition :"
    RECONNECT_STATUS=$(netbird status 2>/dev/null | head -20)
    echo "$RECONNECT_STATUS"
    if echo "$RECONNECT_STATUS" | grep -qi "connected"; then
        ok "  NetBird reconnecté automatiquement"
    else
        warn "  Reconnexion NetBird non confirmée — vérifier manuellement"
    fi
fi

log "  Assistant health post-partition : $(curl -sf --max-time 5 "${ASSISTANT_URL}/health" 2>/dev/null | head -c 100 || echo 'DOWN')"

ok "Chaos drill réseau terminé avec succès"
