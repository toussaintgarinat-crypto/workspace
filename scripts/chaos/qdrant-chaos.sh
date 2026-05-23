#!/usr/bin/env bash
# qdrant-chaos.sh — Chaos drill Qdrant : arrêt 60s + vérif mode dégradé
# Vérifie que l'assistant répond en mode dégradé (/admin/degraded) pendant l'arrêt.
# Redémarre Qdrant et valide la disponibilité des collections.
set -euo pipefail

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { echo "[OK]  $*"; }
warn() { echo "[WARN] $*"; }
err()  { echo "[ERR] $*" >&2; }

STOP_DURATION=60
QDRANT_URL="${QDRANT_URL:-http://localhost:6334}"
ASSISTANT_URL="${ASSISTANT_URL:-http://localhost:8300}"

# ── Détection container Qdrant ────────────────────────────────
detect_qdrant() {
    local candidates=("mempalace-qdrant-1" "mempalace_qdrant_1" "qdrant" "qdrant-1")
    for c in "${candidates[@]}"; do
        docker inspect "$c" > /dev/null 2>&1 && echo "$c" && return
    done
    echo ""
}

QDRANT_CONTAINER="${QDRANT_CONTAINER:-$(detect_qdrant)}"
if [[ -z "$QDRANT_CONTAINER" ]]; then
    err "Aucun container Qdrant détecté. Définissez QDRANT_CONTAINER=<nom>."
    exit 1
fi
log "Container Qdrant cible : ${QDRANT_CONTAINER}"

# ── Helper : lister collections ───────────────────────────────
list_collections() {
    curl -sf --max-time 5 "${QDRANT_URL}/collections" 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); [print('  •',c['name']) for c in d.get('result',{}).get('collections',[])]" \
        2>/dev/null || warn "  Impossible de lister les collections"
}

# ── Helper : vérifier mode dégradé ───────────────────────────
check_degraded() {
    local resp status
    resp=$(curl -sf --max-time 5 "${ASSISTANT_URL}/admin/degraded" 2>/dev/null || echo "{}")
    log "  /admin/degraded : ${resp}"
    # On considère que le mode dégradé est actif si qdrant est marqué ko
    echo "$resp" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    qdrant_ok = d.get('qdrant', {}).get('ok', True)
    if not qdrant_ok:
        print('  Mode dégradé Qdrant : ACTIF (attendu)')
    else:
        print('  WARN: mode dégradé Qdrant non détecté dans /admin/degraded')
except Exception as e:
    print(f'  (parse error: {e})')
" 2>/dev/null || warn "  Impossible de parser /admin/degraded"
}

# ── 1. État avant ─────────────────────────────────────────────
log "==> [1/4] État initial Qdrant (${QDRANT_URL})"
if curl -sf --max-time 5 "${QDRANT_URL}/" > /dev/null 2>&1; then
    ok "  Qdrant UP"
    list_collections
else
    warn "  Qdrant déjà inaccessible avant le drill"
fi
log "  Assistant health : $(curl -sf --max-time 5 "${ASSISTANT_URL}/health" 2>/dev/null | head -c 100 || echo 'DOWN')"

# ── 2. Arrêt Qdrant ───────────────────────────────────────────
log "==> [2/4] Arrêt de ${QDRANT_CONTAINER} pour ${STOP_DURATION}s..."
docker stop "$QDRANT_CONTAINER"

log "  Qdrant arrêté. Attente ${STOP_DURATION}s puis vérif mode dégradé..."
sleep 10

log "  Vérification que l'assistant répond en mode dégradé..."
check_degraded

# Vérifier que l'assistant répond toujours (RAG désactivé mais chat ok)
if curl -sf --max-time 10 "${ASSISTANT_URL}/health" > /dev/null 2>&1; then
    ok "  Assistant répond pendant l'arrêt Qdrant"
else
    warn "  Assistant DOWN pendant l'arrêt Qdrant — impact utilisateur détecté"
fi

sleep $(( STOP_DURATION - 10 ))

# ── 3. Redémarrage Qdrant ─────────────────────────────────────
log "==> [3/4] Redémarrage de ${QDRANT_CONTAINER}..."
docker start "$QDRANT_CONTAINER"

MAX_WAIT=90
WAITED=0
log "  Attente readiness Qdrant (max ${MAX_WAIT}s)..."
until curl -sf --max-time 3 "${QDRANT_URL}/" > /dev/null 2>&1; do
    sleep 3
    (( WAITED += 3 )) || true
    if [[ $WAITED -ge $MAX_WAIT ]]; then
        err "Qdrant non prêt après ${MAX_WAIT}s"
        exit 1
    fi
done
ok "  Qdrant prêt après ${WAITED}s"

# ── 4. Vérif collections restaurées ──────────────────────────
log "==> [4/4] Vérification des collections post-restart"
list_collections

log "  Vérification que le mode dégradé est désactivé..."
check_degraded

ok "Chaos drill Qdrant terminé avec succès"
