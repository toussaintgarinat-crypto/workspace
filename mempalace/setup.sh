#!/bin/bash
set -e

echo "=== MemPalace Standalone Setup ==="

if [ ! -f .env ]; then
    cp .env.example .env

    JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n')
    ADMIN_TOKEN=$(openssl rand -hex 24 | tr -d '\n')

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|change_this_in_production|$JWT_SECRET|g" .env
        sed -i '' "s|change_this_admin_token|$ADMIN_TOKEN|g" .env
    else
        sed -i "s|change_this_in_production|$JWT_SECRET|g" .env
        sed -i "s|change_this_admin_token|$ADMIN_TOKEN|g" .env
    fi

    echo "  .env created — save this admin token for creating users:"
    echo "  MEMPALACE_ADMIN_TOKEN = $ADMIN_TOKEN"
    echo ""
else
    echo "  .env already exists — skipping generation"
fi

docker compose up -d --build

echo ""
echo "MemPalace is starting..."
echo ""
echo "  API    : http://localhost:8100"
echo "  Health : http://localhost:8100/health"
echo "  Docs   : http://localhost:8100/docs"
echo "  Qdrant : http://localhost:6334"
echo ""
echo "Premier compte : POST http://localhost:8100/auth/register"
echo '  {"username": "admin", "password": "votre_mot_de_passe"}'
