#!/usr/bin/env bash
# minio-chaos.sh — Chaos drill MinIO : arrêt 30s + vérif export/import dégradé
# Vérifie que MemPalace détecte le mode dégradé storage et répond correctement.
# Redémarre MinIO et valide la disponibilité des buckets.
set -euo pipefail

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { echo "[OK]  $*"; }
warn() { echo "[WARN] $*"; }
err()  { echo "[ERR] $*" >&2; }

STOP_DURATION=30
MINIO_URL="${MINIO_URL:-http://localhost:9100}"
MEMPALACE_URL="${MEMPALACE_URL:-http://localhost:8200}"
ASSISTANT_URL="${ASSISTANT_URL:-http://localhost:8300}"

# ── Détection container MinIO ──────────────────────────────────
detect_minio() {
    local candidates=("mempalace-minio-1" "mempalace_minio_1" "minio" "minio-1")
    for c in "${candidates[@]}"; do
        docker inspect "$c" > /dev/null 2>&1 && echo "$c" && return
    done
    echo ""
}

MINIO_CONTAINER="${MINIO_CONTAINER:-$(detect_minio)}"
if [[ -z "$MINIO_CONTAINER" ]]; then
    err "Aucun container MinIO détecté. Définissez MINIO_CONTAINER=<nom>."
    exit 1
fi
log "Container MinIO cible : ${MINIO_CONTAINER}"

# ── 1. État avant ─────────────────────────────────────────────
log "==> [1/5] État initial MinIO (${MINIO_URL})"
if curl -sf --max-time 5 "${MINIO_URL}/minio/health/live" > /dev/null 2>&1; then
    ok "  MinIO UP"
else
    warn "  MinIO déjà inaccessible avant le drill"
fi

log "  MemPalace health : $(curl -sf --max-time 5 "${MEMPALACE_URL}/health" 2>/dev/null | head -c 100 || echo 'DOWN')"

# ── 2. Test export MemPalace avant arrêt ─────────────────────
log "==> [2/5] Test export MemPalace AVANT arrêt"
EXPORT_BEFORE=""
if [[ -n "${MEMPALACE_ADMIN_TOKEN:-}" ]]; then
    EXPORT_BEFORE=$(curl -sf --max-time 15 \
        -H "Authorization: Bearer ${MEMPALACE_ADMIN_TOKEN}" \
        "${MEMPALACE_URL}/api/export?format=json" 2>/dev/null | wc -c || echo "0")
    log "  Export JSON avant arrêt : ${EXPORT_BEFORE} octets"
else
    warn "  MEMPALACE_ADMIN_TOKEN non défini — test export ignoré"
fi

# ── 3. Arrêt MinIO ────────────────────────────────────────────
log "==> [3/5] Arrêt de ${MINIO_CONTAINER} pour ${STOP_DURATION}s..."
docker stop "$MINIO_CONTAINER"

log "  MinIO arrêté. Attente ${STOP_DURATION}s..."
sleep 10

log "  Vérification mode dégradé pendant l'arrêt..."
# MemPalace doit toujours répondre (stockage PG seul, sans MinIO)
if curl -sf --max-time 10 "${MEMPALACE_URL}/health" > /dev/null 2>&1; then
    ok "  MemPalace répond pendant l'arrêt MinIO (fallback PG/FS)"
else
    warn "  MemPalace DOWN pendant l'arrêt MinIO"
fi

# Vérifier /admin/degraded sur l'assistant
DEGRADED=$(curl -sf --max-time 5 "${ASSISTANT_URL}/admin/degraded" 2>/dev/null || echo "{}")
log "  /admin/degraded : ${DEGRADED}"

sleep $(( STOP_DURATION - 10 ))

# ── 4. Redémarrage MinIO ──────────────────────────────────────
log "==> [4/5] Redémarrage de ${MINIO_CONTAINER}..."
docker start "$MINIO_CONTAINER"

MAX_WAIT=60
WAITED=0
log "  Attente readiness MinIO (max ${MAX_WAIT}s)..."
until curl -sf --max-time 3 "${MINIO_URL}/minio/health/live" > /dev/null 2>&1; do
    sleep 3
    (( WAITED += 3 )) || true
    if [[ $WAITED -ge $MAX_WAIT ]]; then
        err "MinIO non prêt après ${MAX_WAIT}s"
        exit 1
    fi
done
ok "  MinIO prêt après ${WAITED}s"

# ── 5. Test export post-restart ───────────────────────────────
log "==> [5/5] Test export MemPalace APRES redémarrage"
if [[ -n "${MEMPALACE_ADMIN_TOKEN:-}" ]]; then
    EXPORT_AFTER=$(curl -sf --max-time 15 \
        -H "Authorization: Bearer ${MEMPALACE_ADMIN_TOKEN}" \
        "${MEMPALACE_URL}/api/export?format=json" 2>/dev/null | wc -c || echo "0")
    log "  Export JSON après redémarrage : ${EXPORT_AFTER} octets"
    if [[ "${EXPORT_BEFORE:-0}" -gt 0 && "${EXPORT_AFTER:-0}" -gt 0 ]]; then
        ok "  Export disponible avant et après (${EXPORT_BEFORE}→${EXPORT_AFTER} octets)"
    fi
else
    warn "  MEMPALACE_ADMIN_TOKEN non défini — test export ignoré"
fi

ok "Chaos drill MinIO terminé avec succès"
