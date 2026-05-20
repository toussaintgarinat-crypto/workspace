#!/usr/bin/env bash
# S82 — Backup volumes Docker
# Usage: bash backup/backup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT_DIR/.env"; set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/data}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
DEST="$BACKUP_DIR/$TIMESTAMP"
ERRORS=0

mkdir -p "$DEST"
echo "[backup] Started: $TIMESTAMP → $DEST"

# ── Helpers ───────────────────────────────────────────────────

step() {
  local name="$1"; shift
  echo "[backup] $name..."
  if "$@"; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name — skipped (container not running?)"
    ERRORS=$((ERRORS + 1))
  fi
}

backup_volume() {
  local volume="$1" file="$2"
  docker run --rm -v "$volume:/data" alpine \
    sh -c 'tar -czC /data . 2>/dev/null' > "$DEST/$file"
}

# ── PostgreSQL Forge ──────────────────────────────────────────
step "PostgreSQL Forge" \
  bash -c "docker exec forge-postgres-1 pg_dump \
    -U '${POSTGRES_USER:-forge}' '${POSTGRES_DB:-forge}' \
    | gzip > '$DEST/forge_pg.sql.gz'"

# ── PostgreSQL Oria ───────────────────────────────────────────
step "PostgreSQL Oria" \
  bash -c "docker exec oria-db-1 pg_dump \
    -U '${ORIA_POSTGRES_USER:-oria}' '${ORIA_POSTGRES_DB:-oria}' \
    | gzip > '$DEST/oria_pg.sql.gz'"

# ── PostgreSQL Assistant (si externe) ────────────────────────
if [[ -n "${ASSISTANT_DATABASE_URL:-}" ]] && [[ "${ASSISTANT_DATABASE_URL}" == postgresql* ]]; then
  step "PostgreSQL Assistant" \
    bash -c "pg_dump '${ASSISTANT_DATABASE_URL}' | gzip > '$DEST/assistant_pg.sql.gz'"
fi

# ── Qdrant volumes ────────────────────────────────────────────
step "Qdrant Forge"      backup_volume "forge_qdrant_data"      "forge_qdrant.tar.gz"
step "Qdrant MemPalace"  backup_volume "mempalace_qdrant_data"  "mempalace_qdrant.tar.gz"

# ── MinIO volumes ─────────────────────────────────────────────
step "MinIO Forge"       backup_volume "forge_minio_data"       "forge_minio.tar.gz"
step "MinIO MemPalace"   backup_volume "mempalace_minio_data"   "mempalace_minio.tar.gz"
step "MinIO Oria"        backup_volume "oria_minio_data"        "oria_minio.tar.gz"

# ── Dendrite volumes (Matrix/Oria) ────────────────────────────
step "Dendrite keys"     backup_volume "oria_dendrite_keys"     "oria_dendrite_keys.tar.gz"
step "Dendrite media"    backup_volume "oria_dendrite_media"    "oria_dendrite_media.tar.gz"
step "Dendrite NATS"     backup_volume "oria_dendrite_nats"     "oria_dendrite_nats.tar.gz"

# ── Restic push (optionnel) ───────────────────────────────────
if [[ -n "${BACKUP_RESTIC_REPO:-}" ]]; then
  if command -v restic &>/dev/null; then
    echo "[backup] Restic → ${BACKUP_RESTIC_REPO}"
    RESTIC_PASSWORD="${BACKUP_PASSWORD:-}" \
    restic -r "${BACKUP_RESTIC_REPO}" backup "$DEST" --tag "$TIMESTAMP" --quiet
    RESTIC_PASSWORD="${BACKUP_PASSWORD:-}" \
    restic -r "${BACKUP_RESTIC_REPO}" forget --keep-daily "${BACKUP_KEEP}" --prune --quiet
    echo "  ✓ Restic done"
  else
    echo "  ✗ restic non trouvé sur le host — skipped"
  fi
fi

# ── Rotation locale ───────────────────────────────────────────
echo "[backup] Rotation (keep ${BACKUP_KEEP})..."
ls -1dt "${BACKUP_DIR}"/[0-9]* 2>/dev/null \
  | tail -n +"$((BACKUP_KEEP + 1))" \
  | xargs -r rm -rf
echo "  ✓ Rotation done"

# ── Résumé ────────────────────────────────────────────────────
SIZE=$(du -sh "$DEST" 2>/dev/null | cut -f1)
echo ""
echo "[backup] Completed: $DEST ($SIZE)"
[[ $ERRORS -eq 0 ]] && echo "  Tous les composants sauvegardés." \
  || echo "  Attention: $ERRORS composant(s) ignoré(s) — vérifier les services actifs."
