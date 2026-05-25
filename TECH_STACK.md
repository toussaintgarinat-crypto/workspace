# TECH_STACK — Versions exactes par service

Snapshot des dépendances et images Docker au 2026-05-24.

Sources : `*/requirements.txt`, `*/package.json`, `*/docker-compose*.yml`, `*/Dockerfile`.

---

## Gateway (`gateway/`)

| Composant | Version | Source |
|---|---|---|
| LiteLLM | `main-v1.85.0` | docker-compose.yml |
| Postgres (état LiteLLM) | `16.14-alpine` | docker-compose.yml |

---

## Assistant (`assistant/`)

### Backend Python (`assistant/backend/`)

| Composant | Version | Rôle |
|---|---|---|
| Python | 3.12 | runtime |
| fastapi | 0.115.0 | framework HTTP |
| uvicorn | 0.32.0 | serveur ASGI |
| uvloop | 0.22.1 | event loop |
| httptools | 0.7.1 | parser HTTP |
| pydantic | 2.9.0 | validation |
| pydantic-settings | 2.5.2 | config env |
| SQLAlchemy | 2.0.49 | ORM |
| databases | 0.9.0 | async DB |
| asyncpg | 0.31.0 | driver PG async |
| aiosqlite | 0.22.1 | driver SQLite async |
| redis | 7.4.0 | client Redis |
| APScheduler | 3.10.4 | tâches planifiées |
| openai | 1.50.0 | client LiteLLM Gateway |
| httpx | 0.27.0 | client HTTP |
| circuitbreaker | 2.0.0 | S2S resilience |
| tenacity | 9.1.4 | retry exponentiel |
| cryptography | 43.0.3 | Fernet vault AES-256 |
| python-jose (via shared) | — | JWT Keycloak |
| sse-starlette | 2.1.3 | streaming SSE |
| websockets | 16.0 | WebSocket |
| prometheus-fastapi-instrumentator | 7.1.0 | métriques |
| prometheus_client | 0.25.0 | métriques |
| pywebpush | 2.0.0 | push PWA |
| py-vapid | 1.9.2 | clés VAPID |
| markitdown[pdf,docx,pptx,xlsx] | 0.1.5 | parsing docs |
| pdf2image | 1.17.0 | PDF → images (OCR) |
| pytesseract | 0.3.13 | OCR Tesseract |
| Pillow | 12.2.0 | imaging |
| aiohttp | 3.13.5 | client HTTP alt |

**Tests** : pytest, pytest-asyncio, pytest-cov, respx, aiosqlite (`requirements-dev.txt`).

### Frontend (`assistant/frontend/`)

| Composant | Version | Rôle |
|---|---|---|
| react | ^18.3.0 | UI |
| react-dom | ^18.3.0 | DOM |
| vite | ^5.4.0 | build/dev |
| @vitejs/plugin-react | ^4.3.0 | plugin |
| react-markdown | ^9.0.1 | rendu markdown |
| keycloak-js | ^26.0.0 | auth OIDC |
| @workspace/shared-ui | file:../../shared-ui | composants communs |

### Sidecars

| Composant | Rôle |
|---|---|
| updater | auto-update Docker via docker.sock |
| disk-collector | métriques stockage |

### Images Docker

| Image | Version |
|---|---|
| `redis` | `7.4.9-alpine` |
| `ghcr.io/kiwix/kiwix-serve` | `3.8.2` |
| assistant-backend / frontend | tag CI `YYYYMMDD-SHA7` |

---

## Forge (`forge/`)

### Core API TypeScript (`forge/core/`)

| Composant | Version | Rôle |
|---|---|---|
| Bun | 1.3.10 | runtime + test runner |
| hono | ^4.6.0 | framework HTTP |
| @hono/node-server | ^1.13.0 | adapter |
| @hono/zod-validator | ^0.4.0 | validation |
| zod | ^3.23.0 | schémas |
| drizzle-orm | ^0.36.0 | ORM |
| drizzle-kit | ^0.28.0 | migrations |
| pg | ^8.13.0 | driver Postgres |
| jose | ^5.9.0 | JWT |
| bcryptjs | ^2.4.3 | hash mots de passe |
| otplib | ^12.0.1 | TOTP 2FA |
| ai (Vercel AI SDK) | ^4.0.0 | streaming LLM |
| @ai-sdk/anthropic | ^1.0.0 | provider Claude |
| @ai-sdk/openai | ^1.0.0 | provider OpenAI |
| @ai-sdk/google | ^3.0.64 | provider Gemini |
| @ai-sdk/groq | ^1.0.0 | provider Groq |
| @ai-sdk/mistral | ^3.0.30 | provider Mistral |
| ollama-ai-provider | ^0.16.0 | provider Ollama local |
| @voltagent/core | ^0.1.0 | framework agents |
| @voltagent/vercel-ai | ^0.1.0 | bridge agents ↔ AI SDK |
| @qdrant/js-client-rest | ^1.9.0 | client vectoriel |
| nodemailer | ^8.0.5 | SMTP |
| web-push | ^3.6.7 | push PWA |
| uuid | ^13.0.0 | IDs |
| typescript | ^6.0.3 | dev |

### Frontend (`forge/frontend/`)

| Composant | Version | Rôle |
|---|---|---|
| react | ^18.3.0 | UI |
| vite | ^5.4.0 | build |
| react-router-dom | ^6.28.0 | routing SPA |
| react-i18next | ^17.0.4 | i18n |
| i18next | ^26.0.5 | i18n core |
| @xyflow/react | ^12.10.2 | canvas Pipeline Templates |
| react-force-graph-2d | ^1.29.1 | DAG ForceGraph |
| ai | ^4.0.0 | streaming UI |
| qrcode | ^1.5.4 | TOTP setup |
| keycloak-js | ^26.2.3 | auth |
| @workspace/shared-ui | file:../../shared-ui | composants communs |

### ml-module Python (`forge/ml-module/`)

| Composant | Version | Rôle |
|---|---|---|
| fastapi | 0.115.0 | API |
| uvicorn[standard] | 0.32.0 | serveur |
| pydantic | 2.9.0 | validation |
| qdrant-client | 1.12.0 | vector store |
| sentence-transformers | 3.3.0 | embeddings |
| transformers | 4.46.0 | modèles HF |
| torch | 2.5.0 | tensors |
| langchain-text-splitters | 0.3.0 | chunking docs |
| httpx | 0.27.0 | HTTP |

### Images Docker

| Image | Version |
|---|---|
| `bitnami/etcd` | `3.5` (quorum Patroni) |
| `patroni-pg16` | local (Postgres 16 HA) |
| `edoburu/pgbouncer` | `1.23.1-p1` |
| `quay.io/keycloak/keycloak` | `26.2.5` |
| `qdrant/qdrant` | `v1.18.0` |
| `minio/minio` | `RELEASE.2025-09-07T16-13-09Z` |
| `netbirdio/signal` | `0.71.1` |
| `netbirdio/management` | `0.71.1` |
| `netbirdio/dashboard` | `0.71.1` |

---

## MemPalace (`mempalace/`) — Python :8100

| Composant | Version | Rôle |
|---|---|---|
| fastapi | 0.136.1 | API |
| pydantic | 2.13.4 | validation |
| fastembed | 0.8.0 | embeddings locaux ONNX |
| onnxruntime | 1.26.0 | inférence ONNX |
| huggingface_hub | 1.15.0 | téléchargement modèles |
| openai | 2.37.0 | classification IPCRA via Gateway |
| boto3 | 1.43.9 | client S3 MinIO |
| bcrypt | 5.0.0 | hash |
| cryptography | 48.0.0 | crypto |
| httpx | 0.28.1 | HTTP |
| loguru | 0.7.3 | logs |
| numpy | 2.4.5 | vecteurs |

### Images Docker

| Image | Version |
|---|---|
| `qdrant/qdrant` | `v1.18.0` |
| `minio/minio` | `RELEASE.2025-09-07T16-13-09Z` |

---

## Oria (`oria/`)

### Backend Python (`oria/backend/`)

| Composant | Version | Rôle |
|---|---|---|
| fastapi | 0.111.0 | API |
| uvicorn[standard] | 0.30.1 | serveur |
| sqlalchemy | 2.0.30 | ORM |
| pydantic | 2.7.1 | validation |
| websockets | 12.0 | WebSocket |
| python-jose[cryptography] | 3.3.0 | JWT |
| python-multipart | 0.0.9 | uploads |
| passlib[bcrypt] | 1.7.4 | hash |
| bcrypt | 4.0.1 | hash |
| pyotp | 2.9.0 | TOTP 2FA |
| psycopg2-binary | 2.9.9 | driver PG sync |
| aiosqlite | 0.20.0 | driver SQLite async |
| httpx | 0.27.0 | client HTTP |

### Frontend (`oria/frontend/`)

| Composant | Version | Rôle |
|---|---|---|
| react | ^18.3.1 | UI |
| vite | ^5.3.1 | build |
| matrix-js-sdk | ^34.13.0 | client Matrix |
| livekit-client | ^2.0.0 | WebRTC |
| @livekit/components-react | ^2.6.0 | composants LiveKit |
| @livekit/components-styles | ^1.0.8 | styles |
| yjs | ^13.6.0 | CRDT |
| y-indexeddb | ^9.0.12 | persistance offline |
| y-websocket | ^2.0.4 | sync sockets |
| react-force-graph-2d | ^1.29.1 | graphe rooms |
| keycloak-js | ^26.2.4 | auth |
| @workspace/shared-ui | file:../../shared-ui | composants communs |

### Images Docker

| Image | Version |
|---|---|
| `redis` | `7.4.9-alpine` |
| `bitnami/etcd` | `3.5` |
| `patroni-pg16` | local |
| `edoburu/pgbouncer` | `1.23.1-p1` |
| `quay.io/keycloak/keycloak` | `26.2.5` |
| `minio/minio` | `RELEASE.2025-09-07T16-13-09Z` |
| `livekit/livekit-server` | `v1.12.0` |
| `matrixdotorg/dendrite-monolith` | `v0.13.7` (Dockerfile `oria/matrix/`) |

---

## Shared

### `shared/agent_personnel_shared/` (Python)

Module commun installable (`pip install -e shared/`) :
- Redis helpers (namespacing par service)
- Keycloak client (verify JWT, JWKS cache)
- FastAPI utilities (CORS, exception handlers)
- **S2SClient** (httpx + circuitbreaker + tenacity)
- **HealthBuilder** (`/health` standardisé)

### `shared-ui/` (React)

Lien `file:../../shared-ui` depuis Assistant / Forge / Oria :
- Composants : ChatMessage, Toast, Modal, Spinner, ToolCard
- Hooks : useSSE, useKeycloak, useToast
- Utils : formatters, validators

---

## Infrastructure transverse

### Reverse proxy (`infra/traefik/`)

| Image | Version |
|---|---|
| `traefik` | `v3.3.7` |

Middlewares : rate-limit-auth 20/min, rate-limit-api 60/min.

### Observabilité (`observability/`)

| Image | Version |
|---|---|
| `prom/prometheus` | `v2.55.1` |
| `prom/alertmanager` | `v0.27.0` |
| `prom/node-exporter` | `v1.9.0` |
| `prom/blackbox-exporter` | `v0.25.0` |
| `oliver006/redis_exporter` | `v1.83.0` |
| `prometheuscommunity/postgres-exporter` | `v0.19.1` |
| `grafana/grafana` | `11.6.14-security-04` |
| `alpine` (utilitaires) | `3.20` |

### CI/CD

| Composant | Version |
|---|---|
| GitHub Actions runner | `ubuntu-latest` |
| Python (CI) | `3.12` (cache pip) |
| Bun (CI) | `1.3.10` |
| Registry images | `ghcr.io/toussaintgarinat-crypto/workspace/*` |
| Coverage gate | Assistant ≥ 30% (`--cov-fail-under=30`), Forge ≥ 30% (`scripts/coverage-gate.ts`) |

### Cibles infra (hors-conteneur)

| Composant | Version | Rôle |
|---|---|---|
| Docker Engine | ≥ 24 | runtime |
| Docker Compose | v2 | orchestration |
| Proxmox VE | — | hyperviseur HP G4 SFF (cible prod) |
| LXC + Docker | — | conteneurs applicatifs |
| NetBird | 0.71.1 | mesh VPN |

---

## Récap par catégorie

### Langages
- **Python 3.12** : Assistant, MemPalace, Oria backend, Forge ml-module
- **TypeScript + Bun 1.3** : Forge core
- **JavaScript (React 18 + Vite 5)** : tous les frontends
- **Go (binaire)** : Dendrite (Matrix homeserver)

### Bases de données
- **Postgres 16** (Patroni HA + etcd 3.5) : Forge, Oria, Assistant
- **Qdrant v1.18.0** : Forge, MemPalace
- **Redis 7.4.9-alpine** : Assistant, Oria
- **MinIO RELEASE.2025-09-07** : Forge, MemPalace, Oria
- **SQLite** (dev/tests + KG MemPalace)

### Frameworks HTTP
- **FastAPI** : Python (0.111 → 0.136 selon service)
- **Hono 4** : Forge core (Bun)

### Auth
- **Keycloak 26.2.5** (realms `forge`, `oria`, `master`)
- **JWT léger** (python-jose + bcrypt) : MemPalace standalone
- **TOTP** : pyotp / otplib

### LLM
- **LiteLLM v1.85.0** (Gateway) → OpenRouter (cloud) + Ollama (local)
- **Vercel AI SDK 4** côté Forge

### Temps réel
- **LiveKit v1.12.0** (SFU WebRTC)
- **Dendrite v0.13.7** (Matrix Go)
- **Yjs 13.6** (CRDT) + y-websocket
- **sse-starlette** + Redis pub/sub
