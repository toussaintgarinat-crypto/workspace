#!/bin/sh
set -e

SHARED=/shared
WORKSPACE=/workspace
COMPOSE_FILE="$WORKSPACE/docker-compose.yml"

write_status() {
  printf '{"status":"%s","message":"%s","progress":%d}\n' "$1" "$2" "$3" > "$SHARED/update-status"
}

echo "[updater] starting — COMPOSE_DIR=${COMPOSE_DIR:-/opt/assistant}"
mkdir -p "$SHARED"
chmod 777 "$SHARED"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "[updater] WARN: $COMPOSE_FILE introuvable — COMPOSE_DIR mal configuré. Sidecars en mode dégradé."
  write_status "error" "COMPOSE_DIR mal configuré — mise à jour indisponible." 0
fi

while true; do
  if [ -f "$SHARED/update-request" ]; then
    if [ ! -f "$COMPOSE_FILE" ]; then
      rm -f "$SHARED/update-request"
      write_status "error" "COMPOSE_DIR mal configuré — mise à jour indisponible." 0
      sleep 2
      continue
    fi

    TARGET_TAG=$(jq -r '.target_tag' "$SHARED/update-request")
    rm -f "$SHARED/update-request"
    echo "[updater] update requested: tag=$TARGET_TAG"

    write_status "pulling" "Téléchargement de l'image $TARGET_TAG…" 20

    if ASSISTANT_IMAGE_TAG="$TARGET_TAG" docker-compose \
        -f "$COMPOSE_FILE" \
        --project-directory "$WORKSPACE" \
        pull backend 2>&1; then
      write_status "restarting" "Redémarrage du service…" 80
      if ASSISTANT_IMAGE_TAG="$TARGET_TAG" docker-compose \
          -f "$COMPOSE_FILE" \
          --project-directory "$WORKSPACE" \
          up -d --no-deps backend 2>&1; then
        write_status "done" "Mise à jour terminée." 100
      else
        write_status "error" "Erreur lors du redémarrage." 0
      fi
    else
      write_status "error" "Erreur lors du pull." 0
    fi
  fi
  touch /tmp/updater_last_run
  sleep 2
done
