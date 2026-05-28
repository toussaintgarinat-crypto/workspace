#!/usr/bin/env bash
# ============================================================
#  install.sh — Agent Personnel : installateur universel
#
#  Tout en une commande :
#    curl -fsSL https://raw.githubusercontent.com/toussaintgarinat-crypto/workspace/main/install.sh | bash
#
#  Service spécifique :
#    curl -fsSL https://raw.githubusercontent.com/toussaintgarinat-crypto/workspace/main/install.sh | bash -s -- assistant
#    curl -fsSL https://raw.githubusercontent.com/toussaintgarinat-crypto/workspace/main/install.sh | bash -s -- forge
#    curl -fsSL https://raw.githubusercontent.com/toussaintgarinat-crypto/workspace/main/install.sh | bash -s -- oria
#    curl -fsSL https://raw.githubusercontent.com/toussaintgarinat-crypto/workspace/main/install.sh | bash -s -- mempalace
#    curl -fsSL https://raw.githubusercontent.com/toussaintgarinat-crypto/workspace/main/install.sh | bash -s -- gateway
#    curl -fsSL https://raw.githubusercontent.com/toussaintgarinat-crypto/workspace/main/install.sh | bash -s -- calendar
#    curl -fsSL https://raw.githubusercontent.com/toussaintgarinat-crypto/workspace/main/install.sh | bash -s -- observability
#
# ============================================================
set -e

REPO_URL="https://github.com/toussaintgarinat-crypto/workspace.git"
INSTALL_DIR="${AGENT_INSTALL_DIR:-$HOME/agent-personnel}"
SERVICE="${1:-all}"

# ── Couleurs ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC} $*"; exit 1; }
title()   { echo -e "\n${BOLD}$*${NC}"; }

SERVICES_ALL="gateway mempalace forge calendar assistant oria"
SERVICES_LABELS=(
  "gateway    → LiteLLM API Gateway           (port 4000)"
  "mempalace  → Mémoire sémantique             (port 8100)"
  "forge      → Plateforme agents IA           (port 3000)"
  "calendar   → Calendrier collaboratif        (port 8400)"
  "assistant  → Assistant personnel            (port 8300)"
  "oria       → Réseau social / rooms          (port 3002)"
  "observability → Prometheus + Grafana        (port 3100)"
)

# ── Bannière ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        Agent Personnel — Installateur        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Validation du service demandé ───────────────────────────
VALID_SERVICES="all gateway forge assistant mempalace calendar oria observability"
if ! echo "$VALID_SERVICES" | grep -qw "$SERVICE"; then
  error "Service inconnu : '$SERVICE'\nServices disponibles : $VALID_SERVICES"
fi

# ── Prérequis ───────────────────────────────────────────────
title "1. Vérification des prérequis"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    success "$1 trouvé ($(command -v "$1"))"
  else
    error "$1 est requis mais introuvable. Installe-le puis relance."
  fi
}

check_cmd docker
check_cmd git
check_cmd make

# Docker doit être en cours d'exécution
if ! docker info &>/dev/null; then
  error "Docker est installé mais ne tourne pas. Lance Docker Desktop puis relance."
fi
success "Docker daemon actif"

# ── Clonage / mise à jour ────────────────────────────────────
title "2. Récupération du code"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Répertoire existant détecté : $INSTALL_DIR"
  info "Mise à jour depuis GitHub..."
  git -C "$INSTALL_DIR" pull --ff-only || warn "Impossible de mettre à jour (modifications locales ?)"
  success "Code à jour"
else
  info "Clonage dans $INSTALL_DIR ..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  success "Code cloné"
fi

cd "$INSTALL_DIR"

# ── Configuration .env ──────────────────────────────────────
title "3. Configuration des variables d'environnement"

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    success ".env créé depuis .env.example"
    warn "Pense à éditer .env pour renseigner tes clés API (ANTHROPIC_API_KEY, OPENAI_API_KEY...)"
  else
    warn ".env.example introuvable — .env ignoré"
  fi
else
  success ".env déjà présent"
fi

# Générer les .env de chaque service depuis le .env racine
info "Génération des .env par service..."
make seed-envs 2>/dev/null && success "seed-envs OK" || warn "seed-envs ignoré (variables optionnelles manquantes)"

# ── Réseaux Docker ───────────────────────────────────────────
title "4. Création des réseaux Docker"
make proxy-network
make observability-network
success "Réseaux proxy_net et observability_net prêts"

# ── Démarrage des services ───────────────────────────────────
title "5. Démarrage de : ${BOLD}$SERVICE${NC}"

start_service() {
  local svc="$1"
  info "Démarrage de $svc..."
  make "start-$svc"
  success "$svc démarré"
}

if [ "$SERVICE" = "all" ]; then
  for svc in $SERVICES_ALL; do
    start_service "$svc"
  done
else
  start_service "$SERVICE"
fi

# ── Fix SSL Keycloak (si forge ou oria ou all) ───────────────
should_fix_ssl=false
if [ "$SERVICE" = "all" ] || [ "$SERVICE" = "forge" ] || [ "$SERVICE" = "oria" ]; then
  should_fix_ssl=true
fi

if $should_fix_ssl; then
  title "6. Désactivation SSL Keycloak (dev local)"
  info "Attente que Keycloak soit prêt..."
  for i in $(seq 1 30); do
    if curl -sf http://localhost:8080/realms/master &>/dev/null; then
      break
    fi
    sleep 3
  done

  # Forge Keycloak
  KC_PASS=$(grep '^KEYCLOAK_ADMIN_PASSWORD=' forge/.env 2>/dev/null | cut -d= -f2- || echo "admin123")
  docker exec forge-keycloak-1 /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master --user admin --password "$KC_PASS" 2>/dev/null && \
  docker exec forge-keycloak-1 /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE 2>/dev/null && \
  docker exec forge-keycloak-1 /opt/keycloak/bin/kcadm.sh update realms/forge -s sslRequired=NONE 2>/dev/null || true
  success "SSL Forge Keycloak désactivé"

  # Oria Keycloak
  for i in $(seq 1 20); do
    if curl -sf http://localhost:8081/realms/master &>/dev/null; then
      break
    fi
    sleep 3
  done
  docker exec oria-keycloak-1 /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master --user admin --password admin123 2>/dev/null && \
  docker exec oria-keycloak-1 /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE 2>/dev/null && \
  docker exec oria-keycloak-1 /opt/keycloak/bin/kcadm.sh update realms/oria -s sslRequired=NONE 2>/dev/null || true
  success "SSL Oria Keycloak désactivé"
fi

# ── Résumé ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              Installation terminée           ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

print_url() { echo -e "  ${GREEN}●${NC} $1"; }

if [ "$SERVICE" = "all" ]; then
  echo -e "${BOLD}Accès aux applications :${NC}"
  print_url "Assistant      → http://localhost:8300   (sans login)"
  print_url "Forge          → http://localhost:3000   (créer un compte)"
  print_url "Oria           → http://localhost:3002   (créer un compte)"
  print_url "Grafana        → http://localhost:3100   (admin / admin123)"
  print_url "Keycloak Forge → http://localhost:8080   (admin / admin123)"
  print_url "Keycloak Oria  → http://localhost:8081   (admin / admin123)"
  print_url "Gateway        → http://localhost:4000"
  print_url "MemPalace      → http://localhost:8100"
  print_url "Calendar       → http://localhost:8400"
else
  case "$SERVICE" in
    assistant)    print_url "Assistant  → http://localhost:8300  (sans login)" ;;
    forge)        print_url "Forge      → http://localhost:3000  (créer un compte)"
                  print_url "Keycloak   → http://localhost:8080  (admin / admin123)" ;;
    oria)         print_url "Oria       → http://localhost:3002  (créer un compte)"
                  print_url "Keycloak   → http://localhost:8081  (admin / admin123)" ;;
    mempalace)    print_url "MemPalace  → http://localhost:8100" ;;
    gateway)      print_url "Gateway    → http://localhost:4000" ;;
    calendar)     print_url "Calendar   → http://localhost:8400" ;;
    observability)print_url "Grafana    → http://localhost:3100  (admin / admin123)" ;;
  esac
fi

echo ""
echo -e "  ${YELLOW}Pour arrêter :${NC} cd $INSTALL_DIR && make stop"
echo -e "  ${YELLOW}Pour les logs :${NC} make logs-<service>"
echo ""
