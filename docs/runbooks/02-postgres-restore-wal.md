# Runbook — Restore WAL Archive (Patroni promote échoué)

## Symptômes
- Alertes Prometheus déclenchées : `PostgresPrimaryDown`, `PatroniLeaderElectionFailed`
- Logs typiques :
  ```
  patroni[1]: FATAL: could not connect to the primary server
  patroni[1]: promotion to leader failed — falling back to replica mode
  pg_restore: error: could not read from input file
  ```

## Pré-conditions
- Accès requis : SSH sur le nœud PostgreSQL (HP ou N2), accès Docker
- Credentials : `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_URL` (dans `.env` racine)
- État attendu avant action : Patroni en mode replica ou crash-loop, aucun leader élu depuis > 2 min

---

## Procédure

### 1. Diagnostic rapide

```bash
# Statut Patroni des deux clusters
make pg-status        # forge-pg
make pg-status-oria   # oria-pg

# Logs Patroni
docker logs forge-patroni --tail 50
docker logs oria-patroni --tail 50

# Statut WAL archive local
ls -lht /var/lib/postgresql/wal_archive/ | head -20

# Statut WAL archive MinIO (si NODE2 configuré)
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
mc ls minio-hp/wal-archive/ | tail -20
```

### 2. Stopper Patroni pour intervention manuelle

```bash
# forge-pg
docker stop forge-patroni

# oria-pg
docker stop oria-patroni
```

### 3. Identifier le dernier WAL disponible

```bash
# Archive locale
LAST_WAL=$(ls -t /var/lib/postgresql/wal_archive/*.gz 2>/dev/null | head -1)
echo "Dernier WAL local : $LAST_WAL"

# Archive MinIO (si locale absente ou incomplète)
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
mc ls minio-hp/wal-archive/ | sort | tail -5
```

### 4. Option A — PITR depuis archive locale

```bash
# Arrêter Postgres
docker stop forge-postgres   # ou oria-postgres

# Sauvegarder data dir actuel
docker run --rm \
  -v forge_pg_data:/source \
  -v /tmp/pg_data_backup:/dest \
  alpine sh -c "cp -a /source/. /dest/"

# Créer recovery.conf (Postgres < 12) ou paramètres dans postgresql.conf (>= 12)
# Sur Postgres 14+ (utilisé ici) : créer un fichier recovery.signal + paramètres conf

docker exec -it forge-postgres bash -c "
  cat >> /var/lib/postgresql/data/postgresql.conf <<'EOF'
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
recovery_target_time = '$(date -u -d '5 minutes ago' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u -v-5M '+%Y-%m-%d %H:%M:%S')'
recovery_target_action = 'promote'
EOF
  touch /var/lib/postgresql/data/recovery.signal
"

# Redémarrer Postgres pour lancer la recovery
docker start forge-postgres
docker logs forge-postgres --follow --until=30s | grep -E 'recovery|promote|FATAL'
```

### 5. Option B — PITR depuis archive MinIO

```bash
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Télécharger les WAL dans le répertoire archive local
mkdir -p /var/lib/postgresql/wal_archive_minio
mc cp --recursive minio-hp/wal-archive/ /var/lib/postgresql/wal_archive_minio/

# Configurer restore_command vers le dossier téléchargé
docker exec -it forge-postgres bash -c "
  cat >> /var/lib/postgresql/data/postgresql.conf <<'EOF'
restore_command = 'cp /var/lib/postgresql/wal_archive_minio/%f %p'
recovery_target_action = 'promote'
EOF
  touch /var/lib/postgresql/data/recovery.signal
"
docker start forge-postgres
docker logs forge-postgres --follow --until=60s | grep -E 'recovery|promote|FATAL|LOG'
```

### 6. Option C — pg_basebackup + WAL replay (rebuild complet)

Utiliser si le data dir est corrompu et qu'un replica existe sur N2.

```bash
# Depuis N2 : pg_basebackup vers HP
source .env
pg_basebackup \
  -h ${NODE2_IP} \
  -U replicator \
  -D /var/lib/postgresql/data_restore \
  -Fp -Xs -P -R

# Remplacer le data dir
docker stop forge-postgres
docker run --rm \
  -v forge_pg_data:/target \
  -v /var/lib/postgresql/data_restore:/source \
  alpine sh -c "rm -rf /target/* && cp -a /source/. /target/"
docker start forge-postgres
```

### 7. Relancer Patroni après recovery

```bash
# Vérifier que Postgres a promu (mode primary)
docker exec forge-postgres psql -U postgres -c "SELECT pg_is_in_recovery();"
# Attendu : f (false)

# Relancer Patroni
docker start forge-patroni
sleep 10
make pg-status
```

---

## Vérification post-recovery

```bash
# Statut cluster Patroni
make pg-status
make pg-status-oria

# Connectivité applicative via pgBouncer
docker exec forge-pgbouncer psql -h 127.0.0.1 -p 5432 -U forge_user forge -c "SELECT now();"

# Intégrité données : compter lignes tables critiques
docker exec forge-postgres psql -U postgres forge -c "\dt"
docker exec forge-postgres psql -U postgres forge -c "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"

# Alertes Prometheus résolues
curl -sf http://localhost:9090/api/v1/alerts | python3 -m json.tool | grep -E 'Postgres|Patroni'
```

---

## Communication
- Telegram : `[INCIDENT] PostgresPrimaryDown — WAL restore lancé sur forge-pg. RTO estimé 20 min. Suivi en cours.`
- Qui prévenir : soi-même (infra solo)

## Post-mortem
Voir `POSTMORTEM_TEMPLATE.md`
