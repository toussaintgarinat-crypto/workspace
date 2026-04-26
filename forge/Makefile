.PHONY: start stop logs build reset

start:
	@bash setup.sh

stop:
	docker compose -f docker-compose.standalone.yml down

logs:
	docker compose -f docker-compose.standalone.yml logs -f

build:
	docker compose -f docker-compose.standalone.yml build --no-cache

reset:
	docker compose -f docker-compose.standalone.yml down -v
	@echo "All data volumes removed"
