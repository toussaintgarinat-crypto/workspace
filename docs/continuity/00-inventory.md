# Inventaire continuité — état au 2026-05-21

Source : audit `/review-infra` du S86. Mis à jour à chaque sprint touchant à la continuité (S86-S91).

## Matrice composant × backup × replication × failover × monitoring

| Composant | Backup | Replica | Failover | Healthcheck | Restart | Probe blackbox |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Postgres Forge** | ✅ S82 | ❌ | ❌ | ✅ | ✅ (S86 fix) | ❌ |
| **Postgres Oria** | ✅ S82 | ❌ | ❌ | ✅ | ✅ (S86 fix) | ❌ |
| **Postgres Gateway** | ⚠️ optionnel | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Postgres Keycloak** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Qdrant Forge** | ✅ S82 tarball | ❌ | ❌ | ✅ | ✅ (S86 fix) | ❌ |
| **Qdrant MemPalace** | ✅ S82 tarball | ❌ | ❌ | ✅ | ✅ (S86 fix) | ❌ |
| **MinIO Forge** | ✅ S82 tarball | ❌ | ❌ | ✅ | ✅ | ❌ |
| **MinIO MemPalace** | ✅ S82 tarball | ❌ | ❌ | ✅ | ✅ (S86 fix) | ❌ |
| **MinIO Oria** | ✅ S82 tarball | ❌ | ❌ | ✅ | ✅ (S86 fix) | ❌ |
| **Dendrite (keys/media/NATS)** | ✅ S82 | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Keycloak realms** | ⚠️ import-realm only | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Traefik** | ❌ certs only (acme.json) | ❌ | ❌ | ✅ | ✅ | 🔵 S86 |
| **Assistant backend** | N/A stateless | ✅ scale | ⚠️ leader election | ✅ | ✅ | 🔵 S86 |
| **Oria backend** | N/A stateless | ❌ | ❌ | ✅ | ✅ | 🔵 S86 |
| **MemPalace API** | N/A stateless | ❌ | ❌ | ✅ | ✅ | 🔵 S86 |
| **Forge core** | N/A stateless | ❌ | ❌ | ✅ | ✅ | 🔵 S86 |
| **Gateway (LiteLLM)** | N/A stateless | ❌ | ❌ | ✅ | ✅ | 🔵 S86 |

Légende : ✅ en place · ⚠️ partiel · ❌ manquant · 🔵 configurable via `targets/blackbox-public.yml`

## Gaps prioritaires identifiés

### Comblés en S86
- [x] **Restart policies** : Oria base (redis/db/minio/livekit/frontend) + Forge (postgres/qdrant) + MemPalace (qdrant/minio) → `restart: unless-stopped`
- [x] **Règles Prometheus continuity** : `observability/prometheus/continuity.yml` (probes, postgres, backups, capacity) — 12 règles validées par promtool
- [x] **Blackbox-exporter** : déployé dans `observability/docker-compose.yml`, config `observability/blackbox/blackbox.yml`, probes internes OK
- [x] **Dashboard Grafana** : `observability/grafana/dashboards/continuity.json` (uid `continuity`, 9 panels)
- [x] **Bug Grafana tag** : `11.6.14+security-04` → `11.6.14-security-04` (`+` invalide)
- [x] **Bug Alertmanager S83** : flag `--config.expand-env` retiré (n'existe que pour Prometheus), remplacé par init container envsubst sur `alertmanager.yml.tpl`

### À traiter S87+
- [ ] **Postgres HA** — Patroni + etcd + pgBouncer (S87)
- [ ] **Qdrant snapshots horaires** — script + push node 2 (S88)
- [ ] **MinIO `mc mirror`** vers node 2 (S88)
- [ ] **Keycloak realm export quotidien** — cron docker, à brancher dans `backup/backup.sh` (S88)
- [ ] **Backups en cron** — actuellement manuels via `make backup` (S88)
- [ ] **DNS failover** — Cloudflare LB ou polling OVH (S89)
- [ ] **Page maintenance Plan D** — Cloudflare Pages statique (S89)
- [ ] **Feature flags mode dégradé** — `/admin/degraded` par service (S90)
- [ ] **Runbooks** — 12 procédures de bascule (S91)

## Matrice RTO / RPO cible (rappel)

| Composant | Criticité | RTO | RPO | Mode dégradé |
|---|---|---|---|---|
| Postgres (MemPalace) | 🔴 Vitale | 5 min | ~0 (sync) | Non |
| Traefik (entrée) | 🔴 Vitale | 2 min | N/A | Page maintenance |
| Qdrant (RAG) | 🟠 Haute | 30 min | 1h | Fallback keyword PG |
| MinIO (artefacts) | 🟠 Haute | 30 min | 1h | Bypass upload |
| Keycloak (auth) | 🟠 Haute | 15 min | 5 min | Sessions cachées |
| Gateway (LLM) | 🟠 Haute | 15 min | N/A | Fallback cloud↔local |
| Assistant (chat) | 🟡 Moyenne | 30 min | qq msgs | LLM only, no tools |
| Oria (social) | 🟡 Moyenne | 1h | 1h | Read-only feed |
| Dendrite (Matrix) | 🟡 Moyenne | 1h | 1h | Federation continue |
| Forge (agents) | 🟢 Basse | 4h | 24h | Coupure totale OK |
