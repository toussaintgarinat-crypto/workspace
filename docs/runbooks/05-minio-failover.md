# Runbook — Bascule MinIO N2 + Réconciliation

## Symptômes
- Alertes Prometheus déclenchées : `MinIODown`, `StorageUnavailable`
- Logs typiques :
  ```
  mempalace | ERROR: S3Error: Connect timeout for http://localhost:9000
  assistant  | ERROR: MinIO upload failed: connection refused
  minio      | FATAL: Unable to start server: drive not found
  ```

## Pré-conditions
- Accès requis : SSH HP et/ou N2, accès Docker
- Credentials : `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_URL`, `NODE2_IP` (dans `.env` racine)
- État attendu avant action : MinIO HP injoignable (`make minio-status` retourne DOWN), N2 MinIO opérationnel ou en attente de sync

---

## Procédure

### 1. Diagnostic rapide

```bash
# Santé MinIO HP
make minio-status

# Health live endpoint
curl -sf http://localhost:9100/minio/health/live && echo "UP" || echo "DOWN"
curl -sf http://localhost:9100/minio/health/cluster && echo "Cluster OK" || echo "Cluster KO"

# Logs MinIO
docker logs mempalace-minio-1 --tail 50

# Statut disque (manque d'espace fréquent)
df -h $(docker inspect mempalace-minio-1 --format '{{range .Mounts}}{{.Source}} {{end}}' 2>/dev/null | awk '{print $1}')
```

### 2. Tenter un redémarrage simple (panne transitoire)

```bash
docker restart mempalace-minio-1
sleep 10
curl -sf http://localhost:9100/minio/health/live && echo "MinIO UP après restart" || echo "MinIO toujours DOWN"
```

Si MinIO revient UP, fin de procédure — passer à la vérification.

### 3. Bascule sur MinIO N2

Si HP MinIO reste DOWN, basculer les services vers N2.

```bash
source .env

# Vérifier la disponibilité de N2
curl -sf http://${NODE2_IP}:9100/minio/health/live && echo "N2 MinIO UP" || echo "N2 MinIO AUSSI DOWN"

# Mettre à jour MINIO_URL dans .env
# AVANT : MINIO_URL=localhost:9000
# APRÈS : MINIO_URL=${NODE2_IP}:9000
sed -i.bak "s|^MINIO_URL=.*|MINIO_URL=${NODE2_IP}:9000|" .env
grep MINIO_URL .env
```

### 4. Réconciliation : copier les données manquantes de HP vers N2

Effectuer cette étape si HP MinIO revient en ligne après une panne.

```bash
source .env

# Configurer les alias mc
mc alias set minio-n2 http://${NODE2_IP:-localhost}:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
mc alias set minio-hp http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Lister les buckets des deux côtés
echo "=== Buckets HP ==="
mc ls minio-hp/

echo "=== Buckets N2 ==="
mc ls minio-n2/

# Réconcilier : copier depuis HP vers N2 (sens normal de réplication)
for bucket in pg-backups qdrant-snapshots wal-archive; do
  echo "Sync bucket: $bucket"
  mc mirror --overwrite minio-hp/${bucket} minio-n2/${bucket} \
    && echo "OK ${bucket}" \
    || echo "WARN ${bucket} — bucket absent ou erreur"
done
```

### 5. Réconcilier en sens inverse (N2 → HP, si HP a redémarré après panne longue)

```bash
source .env
mc alias set minio-n2 http://${NODE2_IP:-localhost}:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
mc alias set minio-hp http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# N2 → HP (rattraper les éventuels uploads reçus sur N2 pendant la panne HP)
for bucket in pg-backups qdrant-snapshots wal-archive; do
  echo "Sync inverse N2→HP: $bucket"
  mc mirror --overwrite minio-n2/${bucket} minio-hp/${bucket} \
    && echo "OK ${bucket}" \
    || echo "WARN ${bucket}"
done
```

### 6. Redémarrer les services qui utilisent MinIO

```bash
# Recharger les variables d'environnement et redémarrer les services concernés
docker restart mempalace-backend 2>/dev/null || true
docker restart assistant 2>/dev/null || true
docker restart forge-api 2>/dev/null || true

# Vérifier que les services ont repris la nouvelle MINIO_URL
docker exec mempalace-backend env | grep MINIO
docker exec assistant env | grep MINIO
```

### 7. Restaurer MINIO_URL vers HP quand HP est de nouveau sain

```bash
# Remettre MINIO_URL sur HP
sed -i.bak "s|^MINIO_URL=.*|MINIO_URL=localhost:9000|" .env
grep MINIO_URL .env

# Redémarrer les services
docker restart mempalace-backend assistant forge-api 2>/dev/null || true
```

---

## Vérification post-recovery

```bash
# Santé MinIO
make minio-status

# Informations admin détaillées
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
mc admin info minio-hp

# Lister les buckets et vérifier leur contenu
mc ls minio-hp/
mc ls minio-hp/pg-backups/ | tail -5
mc ls minio-hp/qdrant-snapshots/ | tail -5

# Tester un upload/download
echo "test-recovery-$(date +%s)" > /tmp/minio-test.txt
mc cp /tmp/minio-test.txt minio-hp/pg-backups/minio-test.txt
mc ls minio-hp/pg-backups/minio-test.txt && echo "Upload OK"
mc rm minio-hp/pg-backups/minio-test.txt

# Alertes Prometheus
curl -sf http://localhost:9090/api/v1/alerts | python3 -c \
  "import sys,json; alerts=json.load(sys.stdin)['data']['alerts']; [print(a['labels']['alertname'], a['state']) for a in alerts if 'Minio' in a['labels'].get('alertname','') or 'Storage' in a['labels'].get('alertname','')]"
```

---

## Communication
- Telegram : `[INCIDENT] MinIODown — Bascule vers N2 effectuée. MINIO_URL mis à jour. Réconciliation en cours. Services redémarrés.`
- Qui prévenir : soi-même (infra solo)

## Post-mortem
Voir `POSTMORTEM_TEMPLATE.md`
