# Allocation des ports — host bindings

> Cartographie des ports `host` exposés par chaque service, avec la grille recommandée
> pour la co-localisation sur le HP G4 SFF.

## Principe

Sur ton MacBook en dev, tu lances généralement **une seule stack à la fois** (`make start-forge`
ou `make start-oria` ou `make start-assistant`) → les défauts évitent les collisions.

Sur le **HP G4 SFF** en prod, toutes les stacks tournent ensemble → certains ports entrent
en collision. Tous les ports concernés sont désormais **paramétrables via env** ; les défauts
restent les ports historiques pour ne rien casser en dev.

Pour le HP, copier `.env.hp.example` à la racine vers `.env`, qui réalloue les bindings
host sans toucher les ports internes des conteneurs (et donc sans réécrire les URLs
applicatives qui parlent via le réseau Docker).

## Grille recommandée HP

| Plage | Stack | Usage |
|---|---|---|
| 80, 443 | `infra/traefik` | Point d'entrée HTTP/HTTPS public |
| 3478/udp, 10000, 33073 | `infra/traefik` | NetBird signal/mgmt + TURN (passthrough vers forge en backend) |
| **8080** | `infra/keycloak` | SSO partagé Forge + Assistant + MemPalace + Calendar |
| **8081** | `oria::keycloak` | SSO Oria (population publique, séparée) |
| **8100** | `mempalace::api` | API MemPalace |
| **8200, 8300, 8400, 8090** | `assistant` + `calendar` + `kiwix` | Backend / frontend / calendar / wiki offline |
| **3100, 9093, 9100, 9103** | `observability` | Grafana / Alertmanager / MinIO mempalace / MinIO console |
| **30000–30099** | `forge` (réalloué HP) | voir détail ci-dessous |
| **31000–31099** | `oria` (réalloué HP) | voir détail ci-dessous |

## Variables d'env disponibles

| Variable | Défaut (dev) | Recommandé HP | Service |
|---|---|---|---|
| `FORGE_FRONTEND_PORT` | 3000 | 30000 | `forge::frontend` |
| `FORGE_POSTGRES_PORT` | 5432 | 30005 | `forge::postgres` (Patroni PG) |
| `FORGE_PG_PATRONI_PORT` | 8008 | 30008 | `forge::postgres` (Patroni REST API) |
| `FORGE_COTURN_PORT` | 3478 | 30478 | `forge::coturn` (collision avec traefik public) |
| `FORGE_NETBIRD_SIGNAL_PORT` | 10000 | 30100 | `forge::netbird-signal` (collision avec traefik) |
| `FORGE_NETBIRD_MGMT_PORT` | 33073 | 30073 | `forge::netbird-management` (collision avec traefik) |
| `ORIA_FRONTEND_HOST_PORT` | 3000 | 31000 | `oria::frontend` (prod) — collision avec forge::frontend |
| `KEYCLOAK_HOST_PORT` | 8080 | 8080 | `infra/keycloak` (inchangé, c'est le défaut SSO global) |

## Collisions résolues par cette allocation

| Port défaut | Avant — qui prenait quoi | Après HP |
|---|---|---|
| 3000 | `forge::frontend` ↔ `oria-prod::frontend` | forge → 30000, oria → 31000 |
| 3478 (udp) | `infra/traefik` (TURN public) ↔ `forge::coturn` | traefik garde 3478, forge → 30478 (interne) |
| 5432 | `forge::postgres` collision potentielle hors HP | forge → 30005 |
| **8008** ⚠️ | `forge::postgres` (Patroni REST) ↔ `oria::dendrite` (Matrix) | forge → 30008, oria garde 8008 |
| 8080 | `infra/keycloak` ↔ `forge::keycloak` (doublon supprimé) | infra garde 8080, forge plus de Keycloak |
| 10000 | `infra/traefik` ↔ `forge::netbird-signal` | traefik garde 10000, forge → 30100 |
| 33073 | `infra/traefik` ↔ `forge::netbird-management` | traefik garde 33073, forge → 30073 |

## Notes

- **`oria::keycloak` (8081)** reste séparé d'`infra/keycloak` — populations d'utilisateurs
  distinctes (interne vs externe public). Voir `audit_infra_20260525.md` pour le contexte.
- **`forge/docker-compose.standalone.yml`** garde son Keycloak embarqué — c'est la variante
  conçue pour fonctionner sans `infra/keycloak`.
- Les services *non listés* dans la grille (Grafana, Prometheus, etc.) ne sont pas en
  collision et gardent leurs ports actuels.
