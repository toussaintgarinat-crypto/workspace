# Runbook — Mode dégradé applicatif (S90)

## Principe

Chaque service (assistant, mempalace, oria) expose `/admin/degraded` pour lire et toggler des composants en mode dégradé. L'état est persisté dans Redis (`degraded:{service}:{component}` = `"1"` ou `"0"`). En l'absence de Redis, le fallback se fait sur les variables d'environnement.

Alertmanager peut appeler `POST /admin/degraded/auto` automatiquement via le receiver `degraded-webhook` (token `X-Degraded-Token`).

## Composants par service

| Service     | Composants |
|-------------|------------|
| assistant   | rag, tools, summarize, voice, kiwix |
| mempalace   | qdrant, minio, export, import |
| oria        | readonly, matrix, search, files |

## Drill — Qdrant down

### Simulation

```bash
# 1. Couper Qdrant
docker compose -f mempalace/docker-compose.yml stop qdrant

# 2. Vérifier que Alertmanager déclenche QdrantDown (attendre 2min)
curl http://localhost:9090/api/v1/alerts | jq '.data[] | select(.labels.alertname=="QdrantDown")'

# 3. Vérifier que le webhook a basculé le mode dégradé
curl http://localhost:8000/admin/degraded   # assistant
curl http://localhost:8100/admin/degraded   # mempalace

# 4. Tester la recherche MemPalace — doit retourner degraded:true avec fallback keyword
curl -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"test"}' -H "Content-Type: application/json" \
  http://localhost:8100/api/search
# => {"results":[...],"degraded":true,"fallback":"keyword"}

# 5. Vérifier la bannière UI assistant/oria (poll 30s)
```

### Rétablissement

```bash
# 1. Relancer Qdrant
docker compose -f mempalace/docker-compose.yml start qdrant

# 2. Attendre résolution Alertmanager (send_resolved: true)
# Le webhook POST /admin/degraded/auto repasse degraded=false automatiquement

# 3. Vérifier
curl http://localhost:8000/admin/degraded
# => {"any_degraded": false}

# 4. Vérifier la bannière UI disparaît (dans les 30s)
```

### Toggle manuel (sans Alertmanager)

```bash
# Activer mode dégradé RAG sur assistant
curl -X POST http://localhost:8000/admin/degraded \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"component":"rag","degraded":true}'

# Activer avec TTL (600s = 10min)
curl -X POST http://localhost:8000/admin/degraded \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"component":"rag","degraded":true,"ttl":600}'

# Désactiver
curl -X POST http://localhost:8000/admin/degraded \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"component":"rag","degraded":false}'
```

### Oria read-only (Plan B/C sans Postgres)

```bash
# Activer read-only Oria (toutes écritures bloquées sauf /api/admin)
curl -X POST http://localhost:8000/api/admin/degraded \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"component":"readonly","degraded":true}'

# Health confirme
curl http://localhost:8000/health
# => {"status":"ok","readonly":true}

# Désactiver
curl -X POST http://localhost:8000/api/admin/degraded \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"component":"readonly","degraded":false}'
```

## Variables d'environnement

| Variable | Usage |
|---|---|
| `DEGRADED_WEBHOOK_TOKEN` | Token partagé assistant ↔ Alertmanager (peut être vide en dev) |
| `REDIS_URL` | Persistance des états dégradés (fallback env vars si absent) |
| `ORIA_READONLY` | Valeur par défaut si Redis absent |

## Métriques Prometheus

- `degraded_component_active{service, component}` — 1 si dégradé, 0 si normal
- Alerte `DegradedModeProlonged` — warning si mode dégradé > 30min

## Logs à surveiller

```
WARNING degraded:assistant Degraded mode ON for assistant:rag
WARNING oria Oria running in read-only mode
WARNING mempalace.api MemPalace running in degraded mode
```
