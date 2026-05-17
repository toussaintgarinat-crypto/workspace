# ============================================================
#  Makefile — orchestrateur multi-services
#  Usage : make start        (tous les services)
#          make start-forge  (Forge seulement)
#          make stop         (arrêter tout)
#          make logs-gateway (logs d'un service)
# ============================================================

ENV_FILE := $(CURDIR)/.env
DC := docker compose --env-file $(ENV_FILE)

.PHONY: help start stop restart logs \
        update-free-models \
        proxy-network \
        start-gateway stop-gateway logs-gateway \
        start-forge stop-forge logs-forge \
        start-assistant stop-assistant logs-assistant scale-assistant deploy-assistant \
        start-mempalace stop-mempalace logs-mempalace \
        start-oria stop-oria logs-oria \
        observability-network start-observability stop-observability logs-observability

help:
	@echo ""
	@echo "  make start                    — démarrer tous les services"
	@echo "  make stop                     — arrêter tous les services"
	@echo "  make start-<service>          — démarrer un service (gateway|forge|assistant|mempalace|oria)"
	@echo "  make stop-<service>           — arrêter un service"
	@echo "  make logs-<service>           — voir les logs d'un service"
	@echo "  make scale-assistant N=3      — scaler le backend assistant à N réplicas (nécessite ASSISTANT_DATABASE_URL + ASSISTANT_REDIS_URL)"
	@echo "  make deploy-assistant N=3     — pull GHCR + redémarrer les conteneurs (utilisé par CI/CD)"
	@echo ""
	@echo "  make observability-network    — créer le réseau Docker partagé (1 fois)"
	@echo "  make start-observability      — démarrer Prometheus + Grafana + Redis exporter"
	@echo "  make stop-observability       — arrêter la stack observabilité"
	@echo "  make logs-observability       — voir les logs Prometheus/Grafana"
	@echo "  → Grafana sur http://localhost:3100 (admin / GF_SECURITY_ADMIN_PASSWORD)"
	@echo ""

# ── ALL ──────────────────────────────────────────────────────

start: proxy-network observability-network start-gateway start-mempalace start-forge start-assistant start-oria

stop: stop-gateway stop-mempalace stop-forge stop-assistant stop-oria

restart: stop start

logs:
	@echo "Utilisez make logs-<service> pour voir les logs d'un service spécifique."

# ── GATEWAY ──────────────────────────────────────────────────

update-free-models:
	OPENROUTER_API_KEY=$$(grep '^OPENROUTER_API_KEY=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-) \
	python3 gateway/sync_free_models.py

start-gateway: update-free-models
	$(DC) -f gateway/docker-compose.yml -p gateway up -d

stop-gateway:
	$(DC) -f gateway/docker-compose.yml -p gateway down

logs-gateway:
	$(DC) -f gateway/docker-compose.yml -p gateway logs -f

# ── FORGE ────────────────────────────────────────────────────

start-forge:
	$(DC) -f forge/docker-compose.standalone.yml -p forge up -d

stop-forge:
	$(DC) -f forge/docker-compose.standalone.yml -p forge down

logs-forge:
	$(DC) -f forge/docker-compose.standalone.yml -p forge logs -f

# ── ASSISTANT ────────────────────────────────────────────────
# Les variables sont remappées pour l'assistant

_ASSISTANT_ENV = \
	GATEWAY_URL=$$(grep '^GATEWAY_URL=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo http://localhost:4000) \
	GATEWAY_API_KEY=$$(grep '^GATEWAY_API_KEY=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo sk-assistant) \
	GATEWAY_MASTER_KEY=$$(grep '^LITELLM_MASTER_KEY=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo sk-master-change-this) \
	GATEWAY_MODEL=$$(grep '^GATEWAY_MODEL=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo openai/gpt-4o) \
	AUTH_ENABLED=$$(grep '^AUTH_ENABLED=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo false) \
	KEYCLOAK_REALM=$$(grep '^KEYCLOAK_REALM=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo master) \
	KEYCLOAK_CLIENT_ID=$$(grep '^KEYCLOAK_CLIENT_ID=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo assistant-app) \
	VAULT_SECRET=$$(grep '^VAULT_SECRET=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo change_this) \
	ASSISTANT_DATABASE_URL=$$(grep '^ASSISTANT_DATABASE_URL=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-) \
	ASSISTANT_REDIS_URL=$$(grep '^ASSISTANT_REDIS_URL=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo redis://redis:6379) \
	TELEGRAM_BOT_TOKEN=$$(grep '^TELEGRAM_BOT_TOKEN=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-) \
	TELEGRAM_CHAT_ID=$$(grep '^TELEGRAM_CHAT_ID=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-) \
	DISCORD_WEBHOOK_URL=$$(grep '^DISCORD_WEBHOOK_URL=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-) \
	RAG_ENABLED=$$(grep '^RAG_ENABLED=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo true) \
	RAG_TOP_K=$$(grep '^RAG_TOP_K=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo 5) \
	RAG_MIN_SCORE=$$(grep '^RAG_MIN_SCORE=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo 0.7) \
	SUMMARIZE_ENABLED=$$(grep '^SUMMARIZE_ENABLED=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo true) \
	SUMMARIZE_THRESHOLD=$$(grep '^SUMMARIZE_THRESHOLD=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo 20)

start-assistant:
	$(_ASSISTANT_ENV) \
	docker compose -f assistant/docker-compose.yml -p assistant up -d

# Scaler le backend à N réplicas (ex: make scale-assistant N=3)
# Requiert ASSISTANT_DATABASE_URL (PostgreSQL) + ASSISTANT_REDIS_URL dans .env
N ?= 2
scale-assistant:
	$(_ASSISTANT_ENV) \
	docker compose -f assistant/docker-compose.yml -p assistant up -d --scale backend=$(N) --no-recreate

# Deploy depuis GHCR (CI/CD) : pull les nouvelles images + recrée les conteneurs
# En CI : ASSISTANT_IMAGE_TAG=YYYYMMDD-SHA7 make deploy-assistant N=X
deploy-assistant:
	ASSISTANT_IMAGE_TAG=$${ASSISTANT_IMAGE_TAG:-latest} \
	$(_ASSISTANT_ENV) docker compose -f assistant/docker-compose.yml pull
	ASSISTANT_IMAGE_TAG=$${ASSISTANT_IMAGE_TAG:-latest} \
	$(_ASSISTANT_ENV) docker compose -f assistant/docker-compose.yml -p assistant up -d --scale backend=$(N)

stop-assistant:
	docker compose -f assistant/docker-compose.yml -p assistant down

logs-assistant:
	docker compose -f assistant/docker-compose.yml -p assistant logs -f

# ── MEMPALACE ────────────────────────────────────────────────

start-mempalace:
	JWT_SECRET=$$(grep '^MEMPALACE_JWT_SECRET=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo change_this) \
	MEMPALACE_ADMIN_TOKEN=$$(grep '^MEMPALACE_ADMIN_TOKEN=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-) \
	MINIO_ROOT_USER=$$(grep '^MEMPALACE_MINIO_USER=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo mempalace) \
	MINIO_ROOT_PASSWORD=$$(grep '^MEMPALACE_MINIO_PASSWORD=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo mempalace_secret) \
	GATEWAY_URL=http://localhost:4000 \
	GATEWAY_API_KEY=$$(grep '^GATEWAY_API_KEY=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo sk-mempalace) \
	docker compose -f mempalace/docker-compose.yml -p mempalace up -d

stop-mempalace:
	docker compose -f mempalace/docker-compose.yml -p mempalace down

logs-mempalace:
	docker compose -f mempalace/docker-compose.yml -p mempalace logs -f

# ── ORIA ─────────────────────────────────────────────────────

start-oria:
	POSTGRES_USER=$$(grep '^ORIA_POSTGRES_USER=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo oria) \
	POSTGRES_PASSWORD=$$(grep '^ORIA_POSTGRES_PASSWORD=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo oria_secret) \
	POSTGRES_DB=$$(grep '^ORIA_POSTGRES_DB=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo oria) \
	LIVEKIT_API_SECRET=$$(grep '^ORIA_LIVEKIT_API_SECRET=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo devsecret) \
	MATRIX_SERVER_NAME=$$(grep '^ORIA_MATRIX_SERVER_NAME=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo oria.local) \
	MATRIX_AS_TOKEN=$$(grep '^ORIA_MATRIX_AS_TOKEN=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-) \
	MATRIX_HS_TOKEN=$$(grep '^ORIA_MATRIX_HS_TOKEN=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-) \
	SYNAPSE_DB_PASSWORD=$$(grep '^ORIA_SYNAPSE_DB_PASSWORD=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo synapse_secret) \
	MINIO_ROOT_USER=$$(grep '^ORIA_MINIO_USER=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo oria) \
	MINIO_ROOT_PASSWORD=$$(grep '^ORIA_MINIO_PASSWORD=' $(ENV_FILE) 2>/dev/null | cut -d= -f2- || echo oria_secret) \
	docker compose -f oria/docker-compose.yml -p oria up -d

stop-oria:
	docker compose -f oria/docker-compose.yml -p oria down

logs-oria:
	docker compose -f oria/docker-compose.yml -p oria logs -f

# ── OBSERVABILITY ─────────────────────────────────────────────
# Créer le réseau partagé une seule fois (idempotent)
proxy-network:
	docker network create proxy_net 2>/dev/null || true

observability-network:
	docker network create observability_net 2>/dev/null || true

start-observability: observability-network
	$(DC) -f observability/docker-compose.yml -p observability up -d

stop-observability:
	docker compose -f observability/docker-compose.yml -p observability down

logs-observability:
	docker compose -f observability/docker-compose.yml -p observability logs -f
