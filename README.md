# Workspace — Plateforme IA personnelle

Suite de services open-source pour déployer votre propre assistant IA, mémoire, forge d'agents et plateforme de collaboration en temps réel.

```
┌─────────────────────────────────────────────────────────────┐
│                         WORKSPACE                           │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  │
│  │ Assistant│  │  Forge   │  │ MemPalace │  │   Oria   │  │
│  │ :8300    │  │ :3000    │  │ :8100     │  │ :3002    │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └────┬─────┘  │
│       └─────────────┴──────────────┴───────────────┘        │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │    Gateway      │                      │
│                    │    LiteLLM      │                      │
│                    │    :4000        │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│              ┌──────────────┼──────────────┐                │
│         OpenRouter      Ollama          Autres              │
│                      (IP NetBird)                          │
└─────────────────────────────────────────────────────────────┘
```

| Service | Rôle | Port |
|---|---|---|
| **Gateway** | Routeur LLM unifié (LiteLLM) — OpenRouter, Ollama, etc. | 4000 |
| **Assistant** | Agent ReAct conversationnel, alertes proactives, PWA | 8200 / 8300 |
| **Forge** | Plateforme agents IA, RAG, gestion de projets | 3001 / 3000 |
| **MemPalace** | Mémoire sémantique persistante (96.6% LongMemEval) | 8100 |
| **Oria** | Collaboration temps réel — Matrix, LiveKit, agents résidents | 8000 / 3002 |


## Prérequis

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- Docker Compose v2 (`docker compose version`)
- `make` (inclus sur macOS/Linux)
- 8 Go RAM minimum (16 Go recommandés si tous les services tournent)


## Démarrage rapide

```bash
# 1. Copier et remplir la configuration
cp .env.example .env
# Éditer .env — au minimum : OPENROUTER_API_KEY et les secrets (voir ci-dessous)

# 2. Générer les .env des sous-services (traduction des préfixes ORIA_* / MEMPALACE_*)
make seed-envs

# 3. Démarrer tous les services
make start

# 4. Vérifier
make logs-gateway   # gateway prêt sur :4000
make logs-assistant # assistant prêt sur :8200 / :8300
```

Pour démarrer un seul service :
```bash
make start-gateway
make start-forge
make start-assistant
make start-mempalace
make start-oria
```


## Configuration minimale

Ouvrez `.env` et renseignez **au minimum** ces 5 variables :

```bash
OPENROUTER_API_KEY=sk-or-...        # Clé API OpenRouter (obligatoire)
LITELLM_MASTER_KEY=sk-master-...    # Générer : openssl rand -base64 32
VAULT_SECRET=...                    # Générer : openssl rand -base64 32
ENCRYPTION_KEY=...                  # Générer : openssl rand -base64 32
KEYCLOAK_ADMIN_PASSWORD=...         # Mot de passe fort de votre choix
```

Pour les secrets à générer :
```bash
openssl rand -base64 32   # Pour les clés 32-char (VAULT_SECRET, ENCRYPTION_KEY, etc.)
openssl rand -hex 32      # Pour les tokens hexadécimaux (MATRIX_AS_TOKEN, etc.)
openssl rand -base64 16   # Pour les mots de passe plus courts
```


## Documentation par service

| Service | README |
|---|---|
| Gateway (LiteLLM) | [gateway/README.md](gateway/README.md) |
| Assistant | [assistant/README.md](assistant/README.md) |
| Forge | [forge/README.md](forge/README.md) |
| MemPalace | [mempalace/README.md](mempalace/README.md) |
| Oria | [oria/README.md](oria/README.md) |

Versions exactes de toutes les dépendances par service : [TECH_STACK.md](TECH_STACK.md).


## Commandes Makefile

```bash
make start              # Démarrer tous les services
make stop               # Arrêter tous les services
make restart            # Redémarrer tout

make start-<service>    # Démarrer un service (gateway|forge|assistant|mempalace|oria)
make stop-<service>     # Arrêter un service
make logs-<service>     # Voir les logs en direct
```


## Ports exposés

| Port | Service |
|---|---|
| 4000 | Gateway LiteLLM (API LLM unifiée) |
| 8200 | Assistant backend (API FastAPI) |
| 8300 | Assistant frontend (UI React) |
| 3001 | Forge core API |
| 3000 | Forge frontend |
| 8080 | Keycloak (SSO — partagé Forge/Oria) |
| 6333 | Qdrant (Forge) |
| 6334 | Qdrant (MemPalace) |
| 8100 | MemPalace API |
| 8000 | Oria backend |
| 3002 | Oria frontend |
| 8008 | Matrix/Synapse |
| 7880 | LiveKit |
| 9100 | MinIO MemPalace (S3) |
| 9101 | MinIO Forge (S3) |
| 9106 | MinIO Oria (S3) |
