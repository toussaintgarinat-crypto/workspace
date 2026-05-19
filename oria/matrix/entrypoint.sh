#!/bin/sh
set -e

export MATRIX_SERVER_NAME="${MATRIX_SERVER_NAME:-oria.local}"
export POSTGRES_USER="${POSTGRES_USER:-oria}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-oria_secret}"

envsubst '${MATRIX_SERVER_NAME},${POSTGRES_USER},${POSTGRES_PASSWORD},${MATRIX_REGISTRATION_SHARED_SECRET}' \
  < /etc/dendrite/dendrite.yaml.tpl > /etc/dendrite/dendrite.yaml

envsubst '${MATRIX_AS_TOKEN},${MATRIX_HS_TOKEN},${MATRIX_SERVER_NAME}' \
  < /etc/dendrite/appservice.yaml.tpl > /etc/dendrite/appservice.yaml

DENDRITE_BIN=$(which dendrite-monolith 2>/dev/null || which dendrite 2>/dev/null || echo "/usr/bin/dendrite-monolith")
exec "$DENDRITE_BIN" --config /etc/dendrite/dendrite.yaml
