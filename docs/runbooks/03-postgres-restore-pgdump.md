# Runbook — Restore Postgres depuis pg_dump (dernier recours)

## Symptômes
- Alertes Prometheus déclenchées : `PostgresPrimaryDown`, `PatroniLeaderElectionFailed`
- Situation : WAL archive absent, corrompu ou restore PITR impossible
- Logs typiques :
  ```
  cp: cannot stat '/var/lib/postgresql/wal_archive/000000010000000000000001': No such file or directory
  pg_restore: error: could not read from input file: end of file
  FATAL: database file appears to be corrupted
  ```

## Pré-conditions
- Accès requis : SSH HP, accès Docker, accès MinIO (`mc`)
- Credentials : `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_URL` (dans `.env` racine)
- État attendu avant action : PITR depuis WAL échoué (runbook 02 tenté et infructueux)
- RTO cible : **30 minutes**

---

## Procédure

### 1. Diagnostic rapide

```bash
# Vérifier la disponibilité des dumps
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Lister les dumps disponibles
mc ls minio-hp/pg-backups/ | sort

# Vérifier aussi les backups locaux
ls -lht /backups/pg/ 2>/dev/null | head -10
```

### 2. Identifier le dump le plus récent

```bash
# Dump le plus récent dans MinIO
LATEST_DUMP=$(mc ls minio-hp/pg-backups/ | sort | tail -1 | awk '{print $NF}')
echo "Dump sélectionné : $LATEST_DUMP"

# Ou dump local
LATEST_LOCAL=$(ls -t /backups/pg/*.dump 2>/dev/null | head -1)
echo "Dump local : $LATEST_LOCAL"
```

### 3. Télécharger le dump depuis MinIO

```bash
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Forge
DUMP_DATE=$(date '+%Y-%m-%d')
mc cp minio-hp/pg-backups/forge-${DUMP_DATE}.dump /tmp/forge.dump \
  || mc cp minio-hp/pg-backups/$(mc ls minio-hp/pg-backups/ | grep forge | sort | tail -1 | awk '{print $NF}') /tmp/forge.dump

# Oria
mc cp minio-hp/pg-backups/oria-${DUMP_DATE}.dump /tmp/oria.dump \
  || mc cp minio-hp/pg-backups/$(mc ls minio-hp/pg-backups/ | grep oria | sort | tail -1 | awk '{print $NF}') /tmp/oria.dump

ls -lh /tmp/*.dump
```

### 4. Stopper les services applicatifs (éviter écritures pendant restore)

```bash
# Arrêter les applications qui écrivent en base
docker stop forge-api forge-worker 2>/dev/null || true
docker stop oria-backend 2>/dev/null || true
docker stop forge-pgbouncer oria-pgbouncer 2>/dev/null || true
```

### 5. Restore forge-pg

```bash
# Stopper Patroni et Postgres
docker stop forge-patroni forge-postgres

# Réinitialiser le data dir
docker run --rm \
  -v forge_pg_data:/var/lib/postgresql/data \
  postgres:16 \
  bash -c "rm -rf /var/lib/postgresql/data/* && initdb -D /var/lib/postgresql/data --username=postgres"

# Démarrer Postgres en mode standalone (sans Patroni)
docker start forge-postgres
sleep 5

# Copier le dump dans le conteneur
docker cp /tmp/forge.dump forge-postgres:/tmp/forge.dump

# Créer la base si elle n'existe pas
docker exec forge-postgres psql -U postgres -c "CREATE DATABASE forge;" 2>/dev/null || true
docker exec forge-postgres psql -U postgres -c "CREATE DATABASE keycloak;" 2>/dev/null || true

# Restore
docker exec forge-postgres pg_restore \
  -U postgres \
  -d forge \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  /tmp/forge.dump

echo "Exit code restore forge: $?"
```

### 6. Restore oria-pg

```bash
docker stop oria-patroni oria-postgres

docker run --rm \
  -v oria_pg_data:/var/lib/postgresql/data \
  postgres:16 \
  bash -c "rm -rf /var/lib/postgresql/data/* && initdb -D /var/lib/postgresql/data --username=postgres"

docker start oria-postgres
sleep 5

docker cp /tmp/oria.dump oria-postgres:/tmp/oria.dump

docker exec oria-postgres psql -U postgres -c "CREATE DATABASE oria;" 2>/dev/null || true

docker exec oria-postgres pg_restore \
  -U postgres \
  -d oria \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  /tmp/oria.dump

echo "Exit code restore oria: $?"
```

### 7. Relancer Patroni et pgBouncer

```bash
# Relancer dans l'ordre : Postgres → Patroni → pgBouncer
docker start forge-postgres oria-postgres
sleep 10
docker start forge-patroni oria-patroni
sleep 15
make pg-status
make pg-status-oria

# pgBouncer
docker start forge-pgbouncer oria-pgbouncer
```

### 8. Relancer les services applicatifs

```bash
docker start forge-api forge-worker oria-backend 2>/dev/null || true
```

---

## Vérification post-recovery

```bash
# Intégrité : compter les lignes des tables critiques
docker exec forge-postgres psql -U postgres forge -c \
  "SELECT tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15;"

docker exec oria-postgres psql -U postgres oria -c \
  "SELECT tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15;"

# Test connexion via pgBouncer (port applicatif)
docker exec forge-pgbouncer psql -h 127.0.0.1 -p 5432 -U forge_user forge -c "SELECT now();"

# Vérifier que Patroni a repris la main
make pg-status
make pg-status-oria

# Alertes Prometheus
curl -sf http://localhost:9090/api/v1/alerts | python3 -c \
  "import sys,json; alerts=json.load(sys.stdin)['data']['alerts']; [print(a['labels']['alertname'], a['state']) for a in alerts if 'Postgres' in a['labels'].get('alertname','')]"
```

### Comparer les counts avec la veille (si disponible)

```bash
# Lister les tables et comparer avec le dump précédent
# pg_restore --list permet d'inspecter le dump sans l'appliquer
pg_restore --list /tmp/forge.dump | grep TABLE | head -20
```

---

## Communication
- Telegram : `[INCIDENT] PostgresPrimaryDown — Restore pg_dump lancé (WAL KO). RTO 30 min. Perte données possible depuis dernier dump du $(date '+%Y-%m-%d').`
- Qui prévenir : soi-même (infra solo)

## Post-mortem
Voir `POSTMORTEM_TEMPLATE.md`
