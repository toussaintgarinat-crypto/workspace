.PHONY: start stop logs build reset

start:
	@bash setup.sh

stop:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build --no-cache

reset:
	docker compose down -v
	@echo "All data volumes removed"
