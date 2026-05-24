# API Contracts — Agent Personnel de Création

> Document de référence S99. Format synthétique : version actuelle, endpoints
> canoniques, alias legacy, codes d'erreur. Pour les schémas Pydantic/Zod
> détaillés, voir `<service>/backend/models/` ou `forge/core/src/api/routes/`.

## Conventions globales

- **Versioning** : tous les services exposent leurs routes sous `/v1/...`
  (canonique) ET sous l'ancien chemin (alias legacy).
- **Headers de dépréciation** (RFC 8594) sur l'alias legacy :
  - `Deprecation: true`
  - `Sunset: Mon, 23 Nov 2026 00:00:00 GMT`
  - `Link: </v1/...>; rel="successor-version"`
- **Date de sunset** : 2026-11-23 (~6 mois après livraison S99).
- **Auth** : Bearer JWT. Trois sources possibles selon `AUTH_ENABLED` :
  Keycloak RS256, HS256 local (mempalace), ou désactivée (dev only).
- **Format d'erreur FastAPI** : `{"detail": "<message>"}`
  - 401 = token absent/invalide
  - 403 = manque de rôle (admin)
  - 503 = dépendance externe down (MemPalace circuit ouvert, etc.)

---

## Assistant — port 8200, version 2.0.0

Base canonique : `http://assistant:8200/v1/...`
Alias legacy : `http://assistant:8200/...`

### Health & meta

| Endpoint | Méthode | Description |
|---|---|---|
| `/health` | GET | HealthBuilder schéma S101. Status global + dépendances pg/redis. Exempt du header Deprecation. |
| `/auth/config` | GET | Renvoie `{auth_enabled, keycloak_url, keycloak_realm, keycloak_client_id}`. Public. Exempt. |
| `/models` | GET | Liste des modèles disponibles via la gateway LiteLLM. Auth requise. |
| `/metrics` | GET | Prometheus. Exempt. |

### Chat (SSE streaming)

| Endpoint | Méthode | Body | Réponse | Erreurs |
|---|---|---|---|---|
| `/v1/chat` | POST | `ChatBody{messages, use_prompt_engineer?, rag_enabled?, model?}` | `text/event-stream` (text/tool_start/tool_result/rag_sources/prompt_refined/done) | 429 quota, 503 gateway |

**Note** : le streaming SSE NE PASSE PAS par `S2SClient` côté serveur (pas
de retry sur un flux long). Voir `shared/agent_personnel_shared/http_client.py`.

### Connexions & vault

| Endpoint | Méthode | Description |
|---|---|---|
| `/v1/connections` | GET / POST | Liste / upsert d'une connexion app (mempalace/forge/oria). |
| `/v1/connections/{id}` | DELETE | Supprime une connexion. |
| `/v1/vault/tokens` | GET | Liste les tokens chiffrés vaultés par l'utilisateur. |
| `/v1/vault/tokens/{app_type}` | POST / DELETE | Stocke / supprime un token chiffré. |
| `/v1/vault/oauth-callback/{app_type}` | POST | Callback OAuth (Keycloak PKCE). |

### MemPalace proxy

Tous proxifient l'utilisateur courant vers son MemPalace personnel
(`get_mempalace_creds`). Utilisent `S2SClient` avec circuit breaker.

| Endpoint | Méthode | Backend cible | Fallback gracieux |
|---|---|---|---|
| `/v1/mempalace/wings` | GET | `/v1/api/wings` | 503 si circuit ouvert |
| `/v1/mempalace/search` | POST | `/v1/api/search` | 503 |
| `/v1/mempalace/entries/{wing}` | GET | `/v1/api/wings/{wing}/drawers` | 503 |
| `/v1/mempalace/drawers` | POST | `/v1/api/drawers` | 503 |
| `/v1/mempalace/export?format=json\|markdown` | GET | `/v1/api/export` | 503 |
| `/v1/mempalace/import` | POST | `/v1/api/import` | 503 |

### Autres routers (préfixe `/v1/`)

| Router | Endpoints clés |
|---|---|
| `/v1/swarm/...` | tasks/events SSE (Kanban). |
| `/v1/voice/...` | settings, transcribe, synthesize. |
| `/v1/upload` + `/v1/upload/confirm` | doc intelligence S30. |
| `/v1/conversation/summarize` | summary S39. |
| `/v1/conversations/...` | sync/search/delete (S59). |
| `/v1/persona`, `/v1/scheduled`, `/v1/proactive`, `/v1/push` | S66-S69, S32, S33. |
| `/v1/admin/...` | Admin dashboard, requires Keycloak role `admin`. |

### Endpoints deprecated

Tous les endpoints ci-dessus sont également exposés sans le préfixe `/v1/`
(ex : `/chat`, `/mempalace/wings`). Ils renvoient les headers `Deprecation`
+ `Sunset: 2026-11-23` + `Link: rel="successor-version"`. À supprimer après
cette date.

---

## Oria — port 8000, version 3.0.0

Base canonique : `http://oria:8000/v1/api/...`
Alias legacy : `http://oria:8000/api/...`

### Health & meta

| Endpoint | Méthode | Notes |
|---|---|---|
| `/health` | GET | HealthBuilder, expose `readonly` top-level (compat S86). Exempt. |
| `/` | GET | Banner JSON. Exempt. |

### Mode readonly (middleware)

Si `readonly` est actif (Redis `oria:readonly=1`), TOUS les POST/PUT/PATCH/
DELETE (sauf `/api/admin/*`) renvoient **503** avec `{"detail": "Oria est
en mode lecture seule (maintenance)"}`. S'applique aux deux versions
(legacy et /v1).

### Routers (préfixe `/v1/api/`)

| Router | Endpoints | Tags |
|---|---|---|
| `auth` | `/v1/api/auth/...` (register/login/me/...) | Auth |
| `worlds` | `/v1/api/worlds/...` | Worlds |
| `buildings`, `rooms`, `tokens`, `quartiers`, `invitations` | `/v1/api/<x>/...` | Spatial |
| `files` | `/v1/api/files/...` | Files |
| `network`, `reseau` | `/v1/api/network/...`, `/v1/api/reseau/...` | Intercommunalité |
| `abonnements`, `coins`, `admin` | sans suffixe (`/v1/api/...`) | Monétisation |
| `social`, `jardin`, `shared-zones` | `/v1/api/<x>/...` | Social S48 + Garden S27 |
| `agents`, `documents`, `discover`, `ipcra` | `/v1/api/<x>/...` | IA + IPCRA S30 |
| `votes`, `search`, `llm-config`, `conductor` | `/v1/api/<x>/...` | Outils |

### Exempts versioning

- `/uploads/*` — assets statiques.
- `/ws/yjs/{zone_id}`, `/ws/conductor` — WebSockets Yjs / Conductor.
- `matrix_as.router` — protocole Matrix (chemins imposés).

### Endpoints deprecated

Idem assistant : `/api/...` reste mais avec headers Deprecation/Sunset.

---

## MemPalace — port 8100, version 3.0.0

Base canonique : `http://mempalace:8100/v1/...`
Alias legacy : `http://mempalace:8100/...`

> Spécificité : MemPalace définit ses routes via `@app.get/post` direct (pas
> d'APIRouter). Le versioning passe par un middleware qui **réécrit**
> `request.scope["path"]` `/v1/<x>` → `<x>` avant le routing FastAPI.

### Health

| Endpoint | Description |
|---|---|
| `/health` | HealthBuilder + modes dégradés (qdrant/minio/export/import). Exempt. |
| `/api/qdrant-status` | Disponibilité Qdrant + flag `fallback_enabled`. |

### Auth

| Endpoint | Méthode | Description |
|---|---|---|
| `/v1/auth/login` | POST | OAuth2PasswordRequestForm → access_token (HS256). |
| `/v1/auth/register` | POST | First user free, sinon `MEMPALACE_ADMIN_TOKEN` requis. |
| `/v1/auth/service-token` | POST | Long-lived token pour S2S Forge/Oria. |

### Palace API

| Endpoint | Méthode | Description |
|---|---|---|
| `/v1/api/status` | GET | total + wings counts. |
| `/v1/api/wings` | GET | Liste wings + counts. |
| `/v1/api/wings/{wing}/rooms` | GET | Rooms d'un wing. |
| `/v1/api/wings/{wing}/drawers?limit=` | GET | Liste drawers d'un wing. |
| `/v1/api/taxonomy` | GET | Arbre wings → rooms → counts. |
| `/v1/api/search` | POST | `SearchBody{query, wing?, room?, n_results=5}` → résultats Qdrant ou fallback keyword. |
| `/v1/api/drawers` | POST | `DrawerBody{content, wing, room, metadata?}` → 201 `{id}`. |
| `/v1/api/drawers/{drawer_id}` | DELETE | Suppression. |
| `/v1/api/classify` | POST | `ClassifyBody{content, hint?}` → IPCRA via LiteLLM. |

### Documents

| Endpoint | Méthode | Description |
|---|---|---|
| `/v1/api/documents` | POST | multipart upload + vectorize background. |
| `/v1/api/documents` | GET | Liste docs de l'utilisateur. |
| `/v1/api/documents/{doc_id}` | GET / DELETE | Metadata ou suppression. |
| `/v1/api/documents/{doc_id}/download` | GET | Téléchargement original. |
| `/v1/api/export?format=json\|markdown` | GET | Export complet (S85). |
| `/v1/api/import` | POST | Import dedup sha256 (S85). |

### Admin

| Endpoint | Description |
|---|---|
| `/v1/admin/degraded` | GET / POST — toggle modes dégradés (qdrant/minio/export/import). |
| `/v1/admin/degraded/auto` | POST — webhook Alertmanager. |

### Endpoints deprecated

Tous accessibles sans `/v1/` (alias legacy avec Deprecation/Sunset).

---

## Forge — port 3001, version 0.1.0 (Hono TypeScript)

Base canonique : `http://forge:3001/v1/api/...`
Alias legacy : `http://forge:3001/api/...`

### Health & meta

| Endpoint | Description |
|---|---|
| `/v1/api/health` | Status JSON. Public (avant authMiddleware). |
| `/metrics` | Prometheus. À la racine (pas versionné). |

### Auth

| Endpoint | Description |
|---|---|
| `/v1/api/auth/login` | POST credentials → JWT. |
| `/v1/api/auth/me` | GET / PATCH / DELETE — profil. |
| `/v1/api/auth/me/export` | GET — RGPD export. |
| `/v1/api/sessions/...` | CRUD sessions chat. |

### Routers métier (préfixe `/v1/api/`)

Vue synthétique — 80+ endpoints, voir code source pour détails.

| Domaine | Endpoints clés |
|---|---|
| Chat & Agents | `/chat`, `/agents`, `/agents-factory`, `/poles`, `/voice`, `/voice-realtime`, `/dev-team`, `/devteam/*` |
| Templates & DAG | `/templates`, `/pipeline-templates`, `/task-dag`, `/orchestrator`, `/automation` |
| Business | `/sprints`, `/budget`, `/crm`, `/facturation`, `/stripe`, `/okr`, `/forecast`, `/ventures` |
| Documents & KB | `/documents`, `/contrats`, `/kb`, `/veille`, `/audit`, `/audit-logs` |
| Comm & Social | `/social`, `/imap`, `/calendar`, `/push`, `/webhooks` |
| Sécurité | `/risk-engine`, `/injection-guard`, `/sentinel-rgpd`, `/governor`, `/hitl`, `/legal-agent`, `/agent-autonomy` |
| Ops | `/slo`, `/degradation`, `/staging`, `/incidents`, `/morning-brief`, `/rapport`, `/repetition`, `/conseil` |
| Outils | `/llm-config`, `/api-keys`, `/orgs`, `/netbird`, `/mcp`, `/skills`, `/saved-filters`, `/keybindings` |
| RAG & Mem | `/memory-palace` |
| WebSockets | `/v1/api/ws/...` (auth via query token) |

### Tools S2S consommés par Assistant

| Tool | Endpoint Forge | Méthode |
|---|---|---|
| `forge_create_task` | `/v1/api/tasks` | POST |
| `forge_list_tasks` | `/v1/api/tasks?limit=` | GET |
| `forge_create_sprint` | `/v1/api/sprints` | POST |

### Endpoints deprecated

`/api/...` reste actif avec Deprecation/Sunset jusqu'au 2026-11-23.

---

## Garde-fous S99 partagés

### Streaming SSE → pas de S2SClient

Les flux longs (chat/stream, jardin/chat, voice-realtime, ollama pull,
swarm events, social notifs) restent en `httpx.AsyncClient` direct côté
Python ou `fetch` direct côté JS. Le wrapper retry + circuit breaker
n'est PAS adapté à un flux longue durée.

### POST de création → semantique idempotente garantie côté backend

`S2SClient` retry les timeouts/network errors (jusqu'à 3 fois). Pour
éviter les doublons sur POST `/drawers`, `/tasks`, `/sprints`, les
backends dédupliquent par sha256 du contenu (MemPalace) ou par
contrainte UNIQUE (Forge). En pratique : pas de doublon visible
côté utilisateur, même en cas de retry.

### Cap timeout total

3 retries × wait exponentiel `0.5 → 4s` ≈ **12s max côté retry**,
+ `timeout` httpx par tentative. Pour un timeout par défaut de 5s, le
budget total max est ~27s.

### Circuit breaker

- `failure_threshold` : 5 échecs consécutifs ouvrent le circuit.
- `recovery_timeout` : 30 s avant tentative de half-open.
- `expected_exception` : `httpx.HTTPError` (timeout + 5xx + network).
- **4xx** (mauvais payload) : pas comptés — c'est un bug client, pas
  une panne service.

### Fallback gracieux (patterns à suivre)

- **MemPalace down** → RAG renvoie `("", [])`, le chat continue sans
  contexte. Voir `assistant/backend/rag.py:fetch_rag_context`.
- **Forge down** → tool renvoie un message au LLM ("Forge indisponible,
  je continue sans créer la tâche"). Voir
  `assistant/backend/tools/forge.py:execute_tool`.
- **Oria down** → idem Forge. Voir `assistant/backend/tools/oria.py`.

### Roadmap post-S99

- Migrer les endpoints SSE/streaming restants (SwarmView, NotificationBell,
  JardinPanel, AgentChatPanel) vers `/v1/api/*` côté frontend — scope-down
  S99.
- Migrer `routers/vault_router.py` httpx → S2SClient pour les callbacks
  OAuth (S100+).
- Étendre les contrats : schémas Pydantic + zod en JSON Schema OpenAPI
  pour validation cross-stack.
