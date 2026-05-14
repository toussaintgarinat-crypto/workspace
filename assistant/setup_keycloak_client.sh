#!/usr/bin/env bash
# Sprint 31 — Crée/met à jour le client assistant-app dans Keycloak
# Usage: bash setup_keycloak_client.sh [KEYCLOAK_URL] [REALM] [ADMIN_USER] [ADMIN_PASS]
set -euo pipefail

KC_URL="${1:-http://localhost:8080}"
REALM="${2:-forge}"
ADMIN_USER="${3:-admin}"
ADMIN_PASS="${4:-admin}"

echo "→ Keycloak: $KC_URL  realm: $REALM"

# ── 1. Obtenir un token admin ──────────────────────────────────────────────────
echo "→ Authentification admin..."
TOKEN=$(curl -sf \
  -d "client_id=admin-cli" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  "${KC_URL}/realms/master/protocol/openid-connect/token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

AUTH="Authorization: Bearer ${TOKEN}"

# ── 2. Vérifier si assistant-app existe ───────────────────────────────────────
echo "→ Vérification du client assistant-app..."
EXISTING=$(curl -sf \
  -H "$AUTH" \
  "${KC_URL}/admin/realms/${REALM}/clients?clientId=assistant-app" \
  | python3 -c "import sys,json; clients=json.load(sys.stdin); print(clients[0]['id'] if clients else '')")

CLIENT_PAYLOAD='{
  "clientId": "assistant-app",
  "name": "Assistant App",
  "enabled": true,
  "publicClient": true,
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "redirectUris": ["http://localhost:8300/*"],
  "webOrigins": ["http://localhost:8300"],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "http://localhost:8300/*"
  },
  "protocolMappers": [
    {
      "name": "nom",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "consentRequired": false,
      "config": {
        "userinfo.token.claim": "true",
        "user.attribute": "nom",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "claim.name": "nom",
        "jsonType.label": "String"
      }
    },
    {
      "name": "avatarEmoji",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-attribute-mapper",
      "consentRequired": false,
      "config": {
        "userinfo.token.claim": "true",
        "user.attribute": "avatarEmoji",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "claim.name": "avatarEmoji",
        "jsonType.label": "String"
      }
    }
  ]
}'

if [ -n "$EXISTING" ]; then
  echo "→ Client existant (id: $EXISTING) — mise à jour..."
  HTTP=$(curl -so /dev/null -w "%{http_code}" \
    -X PUT \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    -d "$CLIENT_PAYLOAD" \
    "${KC_URL}/admin/realms/${REALM}/clients/${EXISTING}")
  echo "   PUT → HTTP $HTTP"
else
  echo "→ Création du client..."
  HTTP=$(curl -so /dev/null -w "%{http_code}" \
    -X POST \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    -d "$CLIENT_PAYLOAD" \
    "${KC_URL}/admin/realms/${REALM}/clients")
  echo "   POST → HTTP $HTTP"
fi

echo ""
echo "✅ assistant-app configuré dans le realm '$REALM'"
echo ""
echo "Pour activer l'auth dans l'assistant, ajouter dans assistant/.env :"
echo "  AUTH_ENABLED=true"
echo "  KEYCLOAK_URL=${KC_URL}"
echo "  KEYCLOAK_REALM=${REALM}"
echo "  KEYCLOAK_CLIENT_ID=assistant-app"
