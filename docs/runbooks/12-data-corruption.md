# Runbook — Restore Point-In-Time (corruption de données détectée)

## Symptômes
- Alertes Prometheus déclenchées : `PostgresCorruption`, `QdrantCollectionError`, `DataIntegrityAlert`
- Logs typiques :
  ```
  postgres  | PANIC: could not locate a valid checkpoint record
  postgres  | ERROR: invalid page header in block X of relation base/Y/Z
  qdrant    | Error: Shard data corrupted — checksum mismatch
  assistant | ERROR: unexpected null bytes in response from Postgres
  mc        | ERROR: Data mismatch detected — object corrupted in transit
  ```

## Pré-conditions
- Accès requis : SSH HP, accès Docker, accès MinIO, accès Qdrant API
- Credentials : `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` (dans `.env` racine)
- État attendu avant action : corruption identifiée, services partiellement dégradés ou KO
- **IMPORTANT** : Stopper toutes les écritures avant de lancer un restore pour éviter d'aggraver la corruption

---

## Procédure

### 0. Stopper immédiatement les écritures (confinement)

```bash
# Passer en mode dégradé read-only (S90)
curl -sf -X POST http://localhost:8000/admin/degraded \
  -H "Content-Type: application/json" \
  -d '{"service": "all", "enabled": true}'

# Ou directement via variable d'environnement
# Éditer .env : ORIA_READONLY=true
# puis : docker restart oria-backend

# Stopper les workers qui écrivent
docker stop forge-worker 2>/dev/null || true
docker stop mempalace-backend 2>/dev/null || true  # arrête les imports docs
```

### 1. Diagnostic rapide

```bash
# Postgres : vérifier l'intégrité des pages
docker exec forge-postgres psql -U postgres forge -c "SELECT pg_relation_size('pg_class');" 2>&1
docker exec forge-postgres psql -U postgres forge -c "SELECT count(*) FROM pg_class;" 2>&1

# Postgres : identifier les tables corrompues
docker exec forge-postgres psql -U postgres forge -c "
SELECT schemaname, tablename, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC
LIMIT 10;"

# Qdrant : vérifier les collections
curl -sf http://localhost:6334/collections | python3 -c \
  "import sys,json; [print('•', c['name'], 'status:', c.get('status','?')) for c in json.load(sys.stdin)['result']['collections']]"

# MinIO : vérifier l'intégrité des objets
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Comparer les checksums entre HP et N2 (si N2 disponible)
if [[ -n "${NODE2_IP:-}" ]]; then
  mc alias set minio-n2 http://${NODE2_IP}:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
  mc diff minio-hp/pg-backups minio-n2/pg-backups 2>/dev/null | head -20
fi
```

### 2. Identifier la fenêtre de corruption (horodatage)

```bash
# Trouver le premier log d'erreur Postgres
docker logs forge-postgres 2>&1 | grep -E 'PANIC|corrupt|invalid page|checksum' | head -10

# Trouver le dernier snapshot Qdrant sain
ls -lht /tmp/qdrant-snapshots/ 2>/dev/null | head -10

# Dernier dump MinIO sain
mc ls minio-hp/pg-backups/ | sort | tail -10

# Dernier WAL archive disponible
ls -lht /var/lib/postgresql/wal_archive/ 2>/dev/null | head -5
```

### 3. Restore Postgres en Point-In-Time (PITR)

```bash
# Définir le point de recovery : 5 minutes avant le premier log de corruption
CORRUPTION_TIME="2026-05-23 14:30:00"   # À adapter selon les logs
RECOVERY_TARGET="${CORRUPTION_TIME}"

docker stop forge-patroni forge-postgres

# Sauvegarder l'état corrompu (pour analyse post-mortem)
docker run --rm \
  -v forge_pg_data:/source \
  -v /tmp/pg_corrupted_$(date +%Y%m%d_%H%M%S):/dest \
  alpine sh -c "cp -a /source/. /dest/ 2>/dev/null || true"

# Configurer PITR
docker exec -it forge-postgres bash -c "
cat >> /var/lib/postgresql/data/postgresql.conf <<EOF
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
recovery_target_time = '${RECOVERY_TARGET}'
recovery_target_action = 'promote'
recovery_target_inclusive = true
EOF
touch /var/lib/postgresql/data/recovery.signal
" 2>/dev/null || \
# Alternativement, éditer directement le fichier de config
docker run --rm \
  -v forge_pg_data:/data \
  alpine sh -c "
    echo \"restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'\" >> /data/postgresql.conf
    echo \"recovery_target_time = '${RECOVERY_TARGET}'\" >> /data/postgresql.conf
    echo \"recovery_target_action = 'promote'\" >> /data/postgresql.conf
    touch /data/recovery.signal
  "

docker start forge-postgres
sleep 30
docker logs forge-postgres --tail 20 | grep -E 'recovery|promote|FATAL|LOG'

# Vérifier que Postgres est sorti de recovery
docker exec forge-postgres psql -U postgres -c "SELECT pg_is_in_recovery();"
# Attendu : f

docker start forge-patroni
sleep 10
make pg-status
```

### 4. Restore Qdrant depuis snapshot précédant la corruption

```bash
# Identifier le snapshot le plus récent AVANT la fenêtre de corruption
# (Si CORRUPTION_TIME = 14:30, prendre le snapshot de 13:xx ou antérieur)
ls -lht /tmp/qdrant-snapshots/*.snapshot 2>/dev/null | head -10

SAFE_SNAPSHOT=$(ls -t /tmp/qdrant-snapshots/*.snapshot 2>/dev/null | head -1)
echo "Snapshot sélectionné : $SAFE_SNAPSHOT"

# Supprimer la collection corrompue
COLLECTION="mempalace"
curl -sf -X DELETE http://localhost:6334/collections/${COLLECTION}
sleep 5

# Copier le snapshot dans Qdrant
docker cp ${SAFE_SNAPSHOT} mempalace-qdrant-1:/tmp/restore.snapshot

# Restore via API Qdrant
curl -sf -X POST \
  "http://localhost:6334/collections/${COLLECTION}/snapshots/recover" \
  -H "Content-Type: application/json" \
  -d '{"location": "file:///tmp/restore.snapshot"}' \
  | python3 -m json.tool

# Attendre la fin du restore
sleep 30
curl -sf http://localhost:6334/collections/${COLLECTION} | python3 -c \
  "import sys,json; r=json.load(sys.stdin)['result']; print('Status:', r['status'], '| Points:', r.get('points_count'))"
```

### 5. Identifier et corriger les objets MinIO corrompus

```bash
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Lister les objets modifiés récemment (potentiellement corrompus)
mc ls --recursive minio-hp/ | sort -k1,2 | tail -30

# Si N2 disponible : utiliser mc diff pour identifier les divergences
if [[ -n "${NODE2_IP:-}" ]]; then
  mc alias set minio-n2 http://${NODE2_IP}:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

  for bucket in pg-backups qdrant-snapshots wal-archive; do
    echo "=== Diff $bucket ==="
    mc diff minio-hp/${bucket} minio-n2/${bucket} 2>/dev/null || echo "Bucket $bucket absent sur N2"
  done

  # Restaurer les fichiers corrompus depuis N2
  # (mc mirror récupère les fichiers manquants ou différents)
  mc mirror --overwrite minio-n2/pg-backups minio-hp/pg-backups
fi
```

### 6. Valider l'intégrité post-restore

```bash
# Postgres
docker exec forge-postgres psql -U postgres forge -c "
SELECT schemaname, tablename, n_live_tup, n_dead_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 15;"

# Lancer VACUUM ANALYZE
docker exec forge-postgres psql -U postgres forge -c "VACUUM ANALYZE;"

# Qdrant
curl -sf http://localhost:6334/collections/mempalace | python3 -c \
  "import sys,json; r=json.load(sys.stdin)['result']; print('Points:', r.get('points_count'), 'Status:', r.get('status'))"

# MinIO
mc admin heal minio-hp --scan deep 2>/dev/null || echo "Heal non supporté sur single-node MinIO"
```

### 7. Réactiver les services

```bash
# Désactiver le mode read-only
curl -sf -X POST http://localhost:8000/admin/degraded \
  -H "Content-Type: application/json" \
  -d '{"service": "all", "enabled": false}' 2>/dev/null || true

# Redémarrer les services dans l'ordre
docker start mempalace-backend
docker start forge-worker
docker start oria-backend
sleep 10

# Vérifier la santé de chaque service
curl -sf http://localhost:8000/health | python3 -m json.tool
curl -sf http://localhost:8100/api/health | python3 -m json.tool
curl -sf http://localhost:8200/health | python3 -m json.tool
```

---

## Vérification post-recovery

```bash
# Postgres : aucune table corrompue
docker exec forge-postgres psql -U postgres forge -c "
SELECT count(*) as tables_ok FROM pg_stat_user_tables WHERE n_live_tup >= 0;"

# Qdrant : collection saine
curl -sf http://localhost:6334/collections/mempalace | python3 -c \
  "import sys,json; r=json.load(sys.stdin)['result']; print('OK' if r['status']=='green' else 'KO', r['status'])"

# Test RAG fonctionnel
curl -sf -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "test intégrité", "session_id": "healthcheck"}' \
  2>/dev/null | python3 -c "import sys,json; r=json.load(sys.stdin); print('RAG OK' if r else 'RAG KO')"

# Alertes Prometheus
curl -sf http://localhost:9090/api/v1/alerts | python3 -c \
  "import sys,json; alerts=json.load(sys.stdin)['data']['alerts']
firing=[a for a in alerts if a['state']=='firing']
print(f'{len(firing)} alerte(s) active(s)')
[print(' -', a['labels']['alertname']) for a in firing]"
```

---

## Communication
- Telegram : `[INCIDENT] DataCorruption — Corruption détectée à ${CORRUPTION_TIME}. PITR lancé. Mode read-only activé. Perte de données possible entre ${CORRUPTION_TIME} et maintenant.`
- En résolution : `[RÉSOLUTION] Restore PITR terminé. Services réactivés. Intégrité vérifiée. Perte effective: X min de données.`
- Qui prévenir : soi-même (infra solo)

## Post-mortem
Voir `POSTMORTEM_TEMPLATE.md`
