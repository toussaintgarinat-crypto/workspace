# Runbook — Restore Keycloak (realm + DB)

## Symptômes
- Alertes Prometheus déclenchées : `KeycloakDown`, `AuthServiceUnavailable`
- Logs typiques :
  ```
  keycloak | ERROR: Failed to start Keycloak: Unable to connect to database
  keycloak | FATAL: realm 'agent' not found
  nginx     | upstream connect() failed: connection refused (keycloak:8080)
  traefik   | 502 Bad Gateway — service=keycloak
  ```

## Pré-conditions
- Accès requis : SSH HP, accès Docker
- Credentials : `KC_DB_PASSWORD`, `KC_BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD` (dans `.env` racine)
- Ports : Keycloak sur `8081` (interne Docker), pgBouncer forge sur `5432`
- État attendu avant action : Keycloak en crash-loop ou realm absent après restore Postgres

---

## Procédure

### 1. Diagnostic rapide

```bash
# Statut conteneur Keycloak
docker ps -a | grep keycloak
docker logs keycloak --tail 50

# Test de connectivité HTTP
curl -sf http://localhost:8081/health && echo "Keycloak UP" || echo "Keycloak DOWN"
curl -sf http://localhost:8081/health/ready | python3 -m json.tool

# Vérifier la DB Keycloak (base keycloak dans forge-pg)
docker exec forge-postgres psql -U postgres -c "\l" | grep keycloak
docker exec forge-postgres psql -U postgres -d keycloak -c "SELECT count(*) FROM realm;" 2>/dev/null || echo "Table realm absente"
```

### 2. Redémarrage simple (panne transitoire)

```bash
docker restart keycloak
sleep 20
curl -sf http://localhost:8081/health/ready | python3 -m json.tool
```

Si Keycloak revient UP et les realms sont présents, fin de procédure.

### 3. Exporter le realm avant toute intervention (si Keycloak démarre partiellement)

```bash
# Export de sécurité si Keycloak répond encore
docker exec keycloak /opt/keycloak/bin/kc.sh export \
  --realm agent \
  --dir /tmp/kc-export \
  --users realm_file

# Récupérer l'export sur l'hôte
docker cp keycloak:/tmp/kc-export /tmp/kc-export-$(date +%Y%m%d-%H%M%S)
ls -lh /tmp/kc-export-*/
```

### 4. Restore du realm depuis backup

```bash
# Identifier le backup realm disponible
# Les backups sont dans infra/keycloak/realms/ (versionné Git) ou dump quotidien
ls infra/keycloak/realms/
ls /backups/keycloak/ 2>/dev/null

# Copier le realm JSON dans le conteneur
docker cp infra/keycloak/realms/agent-realm.json keycloak:/tmp/agent-realm.json

# Importer le realm
docker exec keycloak /opt/keycloak/bin/kc.sh import \
  --file /tmp/agent-realm.json \
  --override true

# Vérifier l'import
curl -sf http://localhost:8081/realms/agent/.well-known/openid-configuration | python3 -c \
  "import sys,json; cfg=json.load(sys.stdin); print('Issuer:', cfg.get('issuer'))"
```

### 5. Restore complet depuis pg_dump (si DB keycloak corrompue)

```bash
source .env

# Télécharger le dump keycloak depuis MinIO
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
DUMP_DATE=$(date '+%Y-%m-%d')
mc cp "minio-hp/pg-backups/keycloak-${DUMP_DATE}.dump" /tmp/keycloak.dump \
  || mc cp "minio-hp/pg-backups/$(mc ls minio-hp/pg-backups/ | grep keycloak | sort | tail -1 | awk '{print $NF}')" /tmp/keycloak.dump

# Stopper Keycloak
docker stop keycloak

# Dropper et recréer la base
docker exec forge-postgres psql -U postgres -c "DROP DATABASE IF EXISTS keycloak;"
docker exec forge-postgres psql -U postgres -c "CREATE DATABASE keycloak OWNER keycloak_user;"

# Restore
docker cp /tmp/keycloak.dump forge-postgres:/tmp/keycloak.dump
docker exec forge-postgres pg_restore \
  -U postgres \
  -d keycloak \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  /tmp/keycloak.dump

echo "Exit code pg_restore: $?"

# Redémarrer Keycloak
docker start keycloak
sleep 30
curl -sf http://localhost:8081/health/ready | python3 -m json.tool
```

### 6. Recréer l'admin Keycloak si mot de passe perdu

```bash
source .env

# Keycloak doit être arrêté pour cette opération
docker stop keycloak

# Réinitialiser via variables d'environnement (mode bootstrap)
docker run --rm \
  --env KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  --env KC_BOOTSTRAP_ADMIN_PASSWORD=${KC_BOOTSTRAP_ADMIN_PASSWORD:-changeme} \
  --volumes-from keycloak \
  $(docker inspect keycloak --format='{{.Config.Image}}') \
  /opt/keycloak/bin/kc.sh bootstrap-admin user \
  --username admin

docker start keycloak
sleep 30
```

### 7. Vérifier les clients OIDC (après restore)

```bash
source .env

# Obtenir un token admin
KC_TOKEN=$(curl -sf -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=${KC_BOOTSTRAP_ADMIN_PASSWORD}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Lister les clients du realm agent
curl -sf http://localhost:8081/admin/realms/agent/clients \
  -H "Authorization: Bearer $KC_TOKEN" \
  | python3 -c "import sys,json; [print('•', c['clientId']) for c in json.load(sys.stdin)]"
```

---

## Vérification post-recovery

```bash
# Santé Keycloak
curl -sf http://localhost:8081/health/ready | python3 -m json.tool

# OIDC Discovery endpoint opérationnel
curl -sf http://localhost:8081/realms/agent/.well-known/openid-configuration | python3 -c \
  "import sys,json; cfg=json.load(sys.stdin); print('Issuer OK:', 'agent' in cfg['issuer'])"

# Test login utilisateur (adapter user/password)
curl -sf -X POST "http://localhost:8081/realms/agent/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=assistant&username=test&password=test" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('Token OK' if 'access_token' in r else 'Erreur:', r.get('error_description',''))" \
  2>/dev/null || echo "Login test non disponible"

# Services applicatifs se réauthentifient
docker restart assistant mempalace-backend oria-backend 2>/dev/null || true
sleep 10
curl -sf http://localhost:8000/health | python3 -m json.tool

# Alertes Prometheus
curl -sf http://localhost:9090/api/v1/alerts | python3 -c \
  "import sys,json; alerts=json.load(sys.stdin)['data']['alerts']; [print(a['labels']['alertname'], a['state']) for a in alerts if 'Keycloak' in a['labels'].get('alertname','') or 'Auth' in a['labels'].get('alertname','')]"
```

---

## Communication
- Telegram : `[INCIDENT] KeycloakDown — Restore realm en cours. Authentification indisponible. RTO estimé 15 min. Les sessions existantes restent actives (JWT valides jusqu'à expiration).`
- Qui prévenir : soi-même (infra solo)

## Post-mortem
Voir `POSTMORTEM_TEMPLATE.md`
