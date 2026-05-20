#!/usr/bin/env bash
# S82 — Restore depuis un backup local
# Usage: bash backup/restore.sh [timestamp]
#        bash backup/restore.sh              → liste les backups disponibles
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT_DIR/.env"; set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/data}"

# ── Liste si pas d'argument ───────────────────────────────────
if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <timestamp>"
  echo ""
  echo "Backups disponibles:"
  while IFS= read -r d; do
    size=$(du -sh "$d" 2>/dev/null | cut -f1)
    echo "  $(basename "$d")  ($size)"
  done < <(ls -1dt "${BACKUP_DIR}"/[0-9]* 2>/dev/null)
  exit 0
fi

SRC="$BACKUP_DIR/$1"
[[ -d "$SRC" ]] || { echo "Erreur: backup '$SRC' introuvable."; exit 1; }

echo "[restore] Source: $SRC"
echo ""
echo "ATTENTION: les données actuelles seront écrasées."
echo "Arrêtez les services d'abord si possible : make stop"
echo ""
read -r -p "Continuer ? [y/N] " confirm
[[ "$confirm" =~ ^[yY]$ ]] || { echo "Annulé."; exit 0; }
echo ""

# ── Helpers ───────────────────────────────────────────────────

restore_pg() {
  local file="$1" container="$2" user="$3" db="$4"
  [[ -f "$SRC/$file" ]] || { echo "  — $file absent, skip"; return 0; }
  echo "[restore] PostgreSQL $container ($db)..."
  # Drop + recreate propre (requiert que les autres connexions soient fermées)
  docker exec "$container" psql -U "$user" -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$db' AND pid<>pg_backend_pid();" \
    postgres &>/dev/null || true
  docker exec "$container" dropdb -U "$user" --if-exists "$db"
  docker exec "$container" createdb -U "$user" "$db"
  gunzip -c "$SRC/$file" | docker exec -i "$container" psql -U "$user" "$db" -q
  echo "  ✓ $container/$db"
}

restore_volume() {
  local file="$1" volume="$2"
  [[ -f "$SRC/$file" ]] || { echo "  — $file absent, skip"; return 0; }
  echo "[restore] Volume $volume..."
  # Vide le volume puis extrait
  docker run --rm -v "$volume:/data" alpine sh -c 'rm -rf /data/*'
  docker run --rm -v "$volume:/data" -i alpine tar -xzC /data < "$SRC/$file"
  echo "  ✓ $volume"
}

# ── PostgreSQL ────────────────────────────────────────────────
restore_pg "forge_pg.sql.gz"     "forge-postgres-1" "${POSTGRES_USER:-forge}"      "${POSTGRES_DB:-forge}"
restore_pg "oria_pg.sql.gz"      "oria-db-1"        "${ORIA_POSTGRES_USER:-oria}"   "${ORIA_POSTGRES_DB:-oria}"

# ── Qdrant ────────────────────────────────────────────────────
restore_volume "forge_qdrant.tar.gz"     "forge_qdrant_data"
restore_volume "mempalace_qdrant.tar.gz" "mempalace_qdrant_data"

# ── MinIO ─────────────────────────────────────────────────────
restore_volume "forge_minio.tar.gz"     "forge_minio_data"
restore_volume "mempalace_minio.tar.gz" "mempalace_minio_data"
restore_volume "oria_minio.tar.gz"      "oria_minio_data"

# ── Dendrite ──────────────────────────────────────────────────
restore_volume "oria_dendrite_keys.tar.gz"  "oria_dendrite_keys"
restore_volume "oria_dendrite_media.tar.gz" "oria_dendrite_media"
restore_volume "oria_dendrite_nats.tar.gz"  "oria_dendrite_nats"

echo ""
echo "[restore] Terminé. Relancez les services : make start"
