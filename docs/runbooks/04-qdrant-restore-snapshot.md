# Runbook — Restore Qdrant depuis snapshot (S88)

## Symptômes
- Alertes Prometheus déclenchées : `QdrantDown`, `RAGDegradedMode`
- Logs typiques :
  ```
  qdrant[1]: Error loading collection 'mempalace': file corrupted
  qdrant[1]: Failed to restore shard: No space left on device
  assistant | rag.py | ERROR: Qdrant unavailable — fallback ILIKE PG activé
  ```

## Pré-conditions
- Accès requis : SSH HP, accès Docker, accès MinIO (`mc`) ou répertoire local snapshots
- Credentials : `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_URL`, `QDRANT_URL=http://localhost:6334` (dans `.env` racine)
- État attendu avant action : Qdrant en crash-loop ou collection corrompue identifiée

---

## Procédure

### 1. Diagnostic rapide

```bash
# Statut Qdrant
make qdrant-status

# Santé détaillée
curl -sf http://localhost:6334/ | python3 -m json.tool

# Lister les collections existantes
curl -sf http://localhost:6334/collections | python3 -c \
  "import sys,json; [print('•', c['name']) for c in json.load(sys.stdin)['result']['collections']]"

# Logs Qdrant
docker logs mempalace-qdrant-1 --tail 50
```

### 2. Lister les snapshots disponibles

```bash
# Snapshots locaux (répertoire par défaut)
ls -lht /tmp/qdrant-snapshots/ 2>/dev/null | head -20
ls -lht ${QDRANT_SNAPSHOTS:-/tmp/qdrant-snapshots}/ 2>/dev/null | head -20

# Snapshots dans MinIO
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
mc ls minio-hp/qdrant-snapshots/ | sort | tail -20
```

### 3. Télécharger le snapshot depuis MinIO (si absent en local)

```bash
source .env
mc alias set minio-hp http://${MINIO_URL:-localhost:9000} $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# Trouver les snapshots par collection
COLLECTION="mempalace"   # adapter si nécessaire
LATEST_SNAP=$(mc ls minio-hp/qdrant-snapshots/ | grep "${COLLECTION}" | sort | tail -1 | awk '{print $NF}')
echo "Snapshot sélectionné : $LATEST_SNAP"

mkdir -p /tmp/qdrant-restore
mc cp "minio-hp/qdrant-snapshots/${LATEST_SNAP}" /tmp/qdrant-restore/${LATEST_SNAP}
ls -lh /tmp/qdrant-restore/
```

### 4. Copier le snapshot dans le conteneur Qdrant

```bash
# Qdrant doit être démarré (même si la collection est corrompue)
docker start mempalace-qdrant-1 2>/dev/null || true
sleep 5

# Copier dans le volume Qdrant accessible
docker cp /tmp/qdrant-restore/${LATEST_SNAP} mempalace-qdrant-1:/tmp/${LATEST_SNAP}
```

### 5. Supprimer la collection corrompue (si elle existe)

```bash
COLLECTION="mempalace"

# Vérifier si la collection existe
curl -sf http://localhost:6334/collections/${COLLECTION} | python3 -m json.tool

# Supprimer (ATTENTION : irréversible, utiliser uniquement si corrompue)
curl -sf -X DELETE http://localhost:6334/collections/${COLLECTION}
```

### 6. Restore via API Qdrant

```bash
COLLECTION="mempalace"
SNAP_FILE="/tmp/${LATEST_SNAP}"

# Restore depuis fichier local dans le conteneur
curl -sf -X POST \
  "http://localhost:6334/collections/${COLLECTION}/snapshots/recover" \
  -H "Content-Type: application/json" \
  -d "{\"location\": \"file:///tmp/$(basename ${LATEST_SNAP})\"}" \
  | python3 -m json.tool

# Surveiller la progression (le restore peut prendre quelques minutes)
watch -n 5 'curl -sf http://localhost:6334/collections/mempalace | python3 -m json.tool'
```

### 7. Alternative — Restore depuis snapshot enregistré côté Qdrant

Si le snapshot a été créé via l'API Qdrant et figure dans la liste des snapshots serveur :

```bash
COLLECTION="mempalace"

# Lister les snapshots côté serveur
curl -sf http://localhost:6334/collections/${COLLECTION}/snapshots | python3 -m json.tool

# Récupérer le nom du dernier snapshot
SNAP_NAME=$(curl -sf http://localhost:6334/collections/${COLLECTION}/snapshots \
  | python3 -c "import sys,json; snaps=json.load(sys.stdin)['result']; print(snaps[-1]['name']) if snaps else print('')")

# Restore depuis snapshot serveur
curl -sf -X PUT \
  "http://localhost:6334/collections/${COLLECTION}/snapshots/recover" \
  -H "Content-Type: application/json" \
  -d "{\"location\": \"http://localhost:6334/collections/${COLLECTION}/snapshots/${SNAP_NAME}\"}" \
  | python3 -m json.tool
```

### 8. Déclencher un nouveau snapshot une fois la collection restaurée

```bash
make qdrant-snapshot
# Ou directement :
QDRANT_URL=http://localhost:6334 bash infra/qdrant/snapshot-and-sync.sh
```

---

## Vérification post-recovery

```bash
# Statut global
make qdrant-status

# Compter les vecteurs dans la collection
curl -sf http://localhost:6334/collections/mempalace | python3 -c \
  "import sys,json; r=json.load(sys.stdin)['result']; print('Vecteurs:', r.get('points_count'), '| Status:', r.get('status'))"

# Test recherche sémantique (vérifier que le RAG fonctionne)
curl -sf -X POST http://localhost:8100/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "top_k": 3}' \
  | python3 -m json.tool 2>/dev/null || echo "Endpoint search non disponible"

# Vérifier que le fallback RAG est désactivé (mode normal restauré)
curl -sf http://localhost:8000/health | python3 -m json.tool

# Alertes Prometheus
curl -sf http://localhost:9090/api/v1/alerts | python3 -c \
  "import sys,json; alerts=json.load(sys.stdin)['data']['alerts']; [print(a['labels']['alertname'], a['state']) for a in alerts if 'Qdrant' in a['labels'].get('alertname','') or 'RAG' in a['labels'].get('alertname','')]"
```

---

## Communication
- Telegram : `[INCIDENT] QdrantDown — Restore snapshot en cours (collection: mempalace). Fallback ILIKE PG actif. RTO estimé 10 min.`
- Qui prévenir : soi-même (infra solo)

## Post-mortem
Voir `POSTMORTEM_TEMPLATE.md`
