.PHONY: start stop logs reset build

start:
	docker compose up -d

stop:
	docker compose down

logs:
	docker compose logs -f

reset:
	docker compose down -v

build:
	docker compose build --no-cache
