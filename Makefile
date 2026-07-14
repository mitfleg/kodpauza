SHELL := /bin/bash
.DEFAULT_GOAL := help

LOAD_ENV = set -a; source ./.env; set +a;

.PHONY: help check db migrate api web dev email-domains prod-config stop docker-up docker-down db-logs

help:
	@echo "Локальная разработка:"
	@echo "  make db          PostgreSQL в Docker"
	@echo "  make api         PostgreSQL в Docker + API с hot reload"
	@echo "  make web         Next.js с hot reload"
	@echo "  make dev         PostgreSQL в Docker + API и web с hot reload"
	@echo "  make migrate     применить существующие миграции к local-схеме"
	@echo "  make email-domains обновить блоклист временных почт из GitHub"
	@echo "  make prod-config проверить production Compose на примере env"
	@echo "  make stop        остановить Docker-сервисы проекта"
	@echo "  make db-logs     показать логи PostgreSQL"
	@echo ""
	@echo "Полный Docker-стек:"
	@echo "  make docker-up   собрать и запустить postgres, api и web"
	@echo "  make docker-down остановить полный стек без удаления volume"

check:
	@test -f .env || (echo "Не найден .env. Выполните: cp .env.example .env" && exit 1)
	@command -v pnpm >/dev/null || (echo "Не найден pnpm. Выполните: corepack enable" && exit 1)
	@command -v docker >/dev/null || (echo "Не найден Docker." && exit 1)

db: check
	@docker compose up -d --wait postgres

migrate: db
	@$(LOAD_ENV) pnpm exec prisma migrate deploy --schema prisma/schema.prisma

api: migrate
	@docker compose stop api >/dev/null 2>&1 || true
	@echo "API: http://localhost:$${API_PORT:-4000} (hot reload)"
	@$(LOAD_ENV) pnpm --filter @kodpauza/api dev

web: check
	@docker compose stop web >/dev/null 2>&1 || true
	@echo "Web: http://localhost:$${WEB_PORT:-3000} (hot reload)"
	@$(LOAD_ENV) pnpm --filter @kodpauza/web dev

dev: migrate
	@docker compose stop api web >/dev/null 2>&1 || true
	@echo "API и web запущены локально с hot reload. PostgreSQL работает в Docker."
	@$(LOAD_ENV) pnpm --parallel --filter @kodpauza/api --filter @kodpauza/web dev

email-domains: check
	@pnpm email-domains:update

prod-config:
	@KODPAUZA_ENV_FILE=.env.production.example \
		KODPAUZA_API_IMAGE=ghcr.io/example/kodpauza-api:latest \
		KODPAUZA_WEB_IMAGE=ghcr.io/example/kodpauza-web:latest \
		docker compose --env-file deploy/.env.production.example \
		-f deploy/compose.production.yml config --quiet

stop:
	@docker compose stop api web postgres

db-logs:
	@docker compose logs -f postgres

docker-up: check
	@docker compose up -d --build

docker-down:
	@docker compose down
