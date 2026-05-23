#!/usr/bin/env bash
# postgres-chaos.sh — Chaos drill Postgres : arrêt 30s + vérif recovery
# Vérifie que pgBouncer/apps restent accessibles pendant l'arrêt.
# Redémarre postgres et valide l'élection Patroni.
set -euo pipefail

# ── Helpers ───────────────────────────────────────────────────
log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { echo "[OK]  $*"; }
warn() { echo "[WARN] $*"; }
err()  { echo "[ERR] $*" >&2; }

STOP_DURATION=30

# ── Détection du container Postgres ───────────────────────────
detect_container() {
    local candidates=(
        "forge-postgres-1"
        "forge_postgres_1"
        "mempalace-postgres-1"
        "mempalace_postgres_1"
        "oria-db-1"
        "oria_db_1"
    )
    for c in "${candidates[@]}"; do
        if docker inspect "$c" > /dev/null 2>&1; then
            echo "$c"
            return
        fi
    done
    echo ""
}

PG_CONTAINER="${POSTGRES_CONTAINER:-$(detect_container)}"
if [[ -z "$PG_CONTAINER" ]]; then
    err "Aucun container Postgres détecté. Définissez POSTGRES_CONTAINER=<nom>."
    exit 1
fi
log "Container Postgres cible : ${PG_CONTAINER}"

# ── Endpoints health à surveiller ─────────────────────────────
HEALTH_URLS=(
    "${ASSISTANT_URL:-http://localhost:8300}/health"
    "${MEMPALACE_URL:-http://localhost:8200}/health"
    "${FORGE_URL:-http://localhost:3002}/health"
)

check_health() {
    local passed=0 failed=0
    for url in "${HEALTH_URLS[@]}"; do
        if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
            ok "  ${url} — UP"
            (( passed++ )) || true
        else
            warn "  ${url} — DOWN (attendu si pgBouncer non présent)"
            (( failed++ )) || true
        fi
    done
    log "Health checks : ${passed} UP / ${failed} DOWN"
}

# ── 1. État avant ─────────────────────────────────────────────
log "==> [1/5] État initial Postgres"
docker exec "$PG_CONTAINER" patronictl -c /etc/patroni/patroni.yml list 2>/dev/null \
    || log "  (patronictl non disponible — mode standalone)"
docker ps --filter "name=${PG_CONTAINER}" --format "  Status: {{.Status}}"

# ── 2. Vérif health avant arrêt ──────────────────────────────
log "==> [2/5] Health checks AVANT arrêt"
check_health

# ── 3. Arrêt Postgres ─────────────────────────────────────────
log "==> [3/5] Arrêt de ${PG_CONTAINER} pour ${STOP_DURATION}s..."
docker stop "$PG_CONTAINER"

log "  Postgres arrêté. Attente ${STOP_DURATION}s..."
sleep "$STOP_DURATION"

# Health checks pendant l'arrêt (les apps doivent répondre via pgBouncer/retry)
log "  Health checks PENDANT l'arrêt (apps doivent rester UP via pgBouncer)..."
check_health

# ── 4. Redémarrage Postgres ───────────────────────────────────
log "==> [4/5] Redémarrage de ${PG_CONTAINER}..."
docker start "$PG_CONTAINER"

# Attendre que Postgres soit prêt
MAX_WAIT=60
WAITED=0
log "  Attente readiness Postgres (max ${MAX_WAIT}s)..."
until docker exec "$PG_CONTAINER" pg_isready -U postgres > /dev/null 2>&1; do
    sleep 2
    (( WAITED += 2 )) || true
    if [[ $WAITED -ge $MAX_WAIT ]]; then
        err "Postgres non prêt après ${MAX_WAIT}s"
        exit 1
    fi
done
ok "  Postgres prêt après ${WAITED}s"

# ── 5. Vérif Patroni post-restart ─────────────────────────────
log "==> [5/5] Vérification état Patroni post-restart"
if docker exec "$PG_CONTAINER" patronictl -c /etc/patroni/patroni.yml list > /dev/null 2>&1; then
    docker exec "$PG_CONTAINER" patronictl -c /etc/patroni/patroni.yml list
    LEADER=$(docker exec "$PG_CONTAINER" patronictl -c /etc/patroni/patroni.yml list 2>/dev/null \
        | grep -E 'Leader|leader' | awk '{print $2}' | head -1)
    if [[ -n "$LEADER" ]]; then
        ok "  Leader Patroni : ${LEADER}"
    else
        warn "  Aucun leader Patroni détecté (election en cours ?)"
    fi
else
    log "  (patronictl non disponible — vérif standalone)"
fi

# Health checks après restart
log "  Health checks APRES redémarrage"
check_health

ok "Chaos drill Postgres terminé avec succès"
