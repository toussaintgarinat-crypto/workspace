.PHONY: start stop logs build reset

start:
	docker network create proxy_net 2>/dev/null || true
	docker compose -p calendar up -d

stop:
	docker compose -p calendar down

logs:
	docker compose -p calendar logs -f

build:
	docker compose -p calendar build --no-cache

reset:
	docker compose -p calendar down -v
	@echo "All data volumes removed"
