#!/usr/bin/env bash
# Usage: bash scripts/download_zim.sh [fr_mini|fr|en_mini|en]
# Default: fr_mini (~50 Mo). Full Wikipedia fr: ~5 Go.
set -euo pipefail

VARIANT="${1:-fr_mini}"
ZIM_DIR="${ZIM_PATH:-/opt/assistant/zim}"
BASE_URL="https://download.kiwix.org/zim/wikipedia/"

declare -A ZIM_FILES=(
  [fr_mini]="wikipedia_fr_wp_mini_"
  [fr]="wikipedia_fr_all_nopic_"
  [en_mini]="wikipedia_en_wp_mini_"
  [en]="wikipedia_en_all_nopic_"
)

if [[ -z "${ZIM_FILES[$VARIANT]+x}" ]]; then
  echo "Variante inconnue: $VARIANT"
  echo "Options: fr_mini (défaut, ~50 Mo) | fr (~5 Go) | en_mini | en"
  exit 1
fi

PREFIX="${ZIM_FILES[$VARIANT]}"

echo "Recherche du dernier fichier ZIM pour: $PREFIX"
FILENAME=$(curl -fsSL "${BASE_URL}" | grep -oP "${PREFIX}[0-9-]+\.zim" | sort -r | head -1)

if [[ -z "$FILENAME" ]]; then
  echo "Impossible de trouver un fichier ZIM pour $VARIANT sur $BASE_URL"
  exit 1
fi

mkdir -p "$ZIM_DIR"
DEST="$ZIM_DIR/$FILENAME"

if [[ -f "$DEST" ]]; then
  echo "Déjà téléchargé: $DEST"
  exit 0
fi

echo "Téléchargement: ${BASE_URL}${FILENAME} → $DEST"
curl -L --progress-bar -o "$DEST" "${BASE_URL}${FILENAME}"
echo "Téléchargement terminé. Redémarre kiwix pour charger le fichier :"
echo "  docker compose restart kiwix"
