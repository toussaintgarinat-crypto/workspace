#!/usr/bin/env bash
# Désactive le SSL required sur tous les realms après chaque redémarrage Keycloak.
# Lancer avec : bash fix_keycloak_ssl.sh
set -e

echo "⏳ Attente que Keycloak soit prêt..."
until curl -sf http://localhost:8080/realms/master > /dev/null 2>&1; do
  sleep 2
done

echo "🔑 Connexion admin..."
docker exec forge-keycloak-1 /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin

echo "🔒 Désactivation SSL — realm master"
docker exec forge-keycloak-1 /opt/keycloak/bin/kcadm.sh update realms/master \
  -s sslRequired=NONE

echo "🔒 Désactivation SSL — realm forge"
docker exec forge-keycloak-1 /opt/keycloak/bin/kcadm.sh update realms/forge \
  -s sslRequired=NONE 2>/dev/null || echo "  (forge realm inexistant, skip)"

echo "🔒 Désactivation SSL — realm oria"
docker exec forge-keycloak-1 /opt/keycloak/bin/kcadm.sh update realms/oria \
  -s sslRequired=NONE 2>/dev/null || echo "  (oria realm inexistant, skip)"

echo "✅ SSL désactivé sur tous les realms"
