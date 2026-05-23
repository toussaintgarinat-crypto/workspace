#!/usr/bin/env bash
# ollama-chaos.sh — Chaos drill Ollama : arrêt/blocage 60s + vérif fallback LLM
# Si root   : bloque le port via iptables (DROP) pour simuler un timeout réseau.
# Sinon     : arrêt du container ollama-bridge.
# Vérifie que l'assistant bascule sur OpenRouter/DeepSeek si configuré.
set -euo pipefail

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { echo "[OK]  $*"; }
warn() { echo "[WARN] $*"; }
err()  { echo "[ERR] $*" >&2; }

STOP_DURATION=60
ASSISTANT_URL="${ASSISTANT_URL:-http://localhost:8300}"
OLLAMA_PORT="${OLLAMA_PORT:-11434}"

# ── Détection container Ollama ────────────────────────────────
detect_ollama() {
    local candidates=("ollama-bridge" "ollama_bridge" "ollama-bridge-1" "ollama" "ollama-1")
    for c in "${candidates[@]}"; do
        docker inspect "$c" > /dev/null 2>&1 && echo "$c" && return
    done
    echo ""
}

OLLAMA_CONTAINER="${OLLAMA_CONTAINER:-$(detect_ollama)}"
USE_IPTABLES=false

if [[ $EUID -eq 0 ]] && command -v iptables > /dev/null 2>&1; then
    USE_IPTABLES=true
    log "Mode root détecté — blocage iptables sur port ${OLLAMA_PORT}"
else
    if [[ -z "$OLLAMA_CONTAINER" ]]; then
        err "Pas root et aucun container Ollama détecté. Définissez OLLAMA_CONTAINER=<nom>."
        exit 1
    fi
    log "Mode non-root — arrêt du container : ${OLLAMA_CONTAINER}"
fi

# ── 1. État avant ─────────────────────────────────────────────
log "==> [1/4] État initial"
if curl -sf --max-time 5 "http://localhost:${OLLAMA_PORT}/api/version" > /dev/null 2>&1; then
    OLLAMA_VERSION=$(curl -sf --max-time 5 "http://localhost:${OLLAMA_PORT}/api/version" \
        | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('version','?'))" 2>/dev/null || echo "?")
    ok "  Ollama UP (v${OLLAMA_VERSION})"
else
    warn "  Ollama déjà inaccessible avant le drill"
fi
log "  Assistant health : $(curl -sf --max-time 5 "${ASSISTANT_URL}/health" 2>/dev/null | head -c 100 || echo 'DOWN')"

# ── 2. Blocage/Arrêt Ollama ───────────────────────────────────
log "==> [2/4] Blocage Ollama pour ${STOP_DURATION}s..."

if [[ "$USE_IPTABLES" == "true" ]]; then
    # Créer une chaîne dédiée pour pouvoir flusher proprement
    iptables -N CHAOS_OLLAMA 2>/dev/null || iptables -F CHAOS_OLLAMA
    iptables -A CHAOS_OLLAMA -p tcp --dport "$OLLAMA_PORT" -j DROP
    iptables -A CHAOS_OLLAMA -p tcp --sport "$OLLAMA_PORT" -j DROP
    iptables -I OUTPUT 1 -j CHAOS_OLLAMA
    log "  iptables DROP activé sur port ${OLLAMA_PORT}"
else
    docker stop "$OLLAMA_CONTAINER"
    log "  Container ${OLLAMA_CONTAINER} arrêté"
fi

# ── 3. Vérification fallback LLM ──────────────────────────────
log "==> [3/4] Vérification fallback LLM pendant le blocage (${STOP_DURATION}s)..."
sleep 10

log "  Test appel assistant (doit basculer sur OpenRouter/DeepSeek si configuré)..."
FALLBACK_RESP=$(curl -sf --max-time 20 \
    -X POST "${ASSISTANT_URL}/api/chat" \
    -H "Content-Type: application/json" \
    -d '{"model":"auto","messages":[{"role":"user","content":"ping fallback"}],"stream":false}' \
    2>/dev/null || echo "")

if [[ -n "$FALLBACK_RESP" ]]; then
    MODEL_USED=$(echo "$FALLBACK_RESP" | python3 -c \
        "import sys,json;d=json.load(sys.stdin);print(d.get('model','?'))" 2>/dev/null || echo "?")
    ok "  Réponse obtenue — modèle utilisé : ${MODEL_USED}"
    if echo "$MODEL_USED" | grep -qiE "openrouter|deepseek|claude|gpt|gemini"; then
        ok "  Fallback LLM confirmé : ${MODEL_USED}"
    else
        warn "  Modèle utilisé inconnu ou local : ${MODEL_USED}"
    fi
else
    warn "  Aucune réponse de l'assistant pendant le blocage Ollama"
    warn "  (Normal si fallback LLM non configuré — OPENROUTER_API_KEY ?)"
fi

# Vérifier /admin/degraded
DEGRADED=$(curl -sf --max-time 5 "${ASSISTANT_URL}/admin/degraded" 2>/dev/null || echo "{}")
log "  /admin/degraded : ${DEGRADED}"

sleep $(( STOP_DURATION - 10 ))

# ── 4. Restauration ───────────────────────────────────────────
log "==> [4/4] Restauration Ollama..."

if [[ "$USE_IPTABLES" == "true" ]]; then
    iptables -D OUTPUT -j CHAOS_OLLAMA 2>/dev/null || true
    iptables -F CHAOS_OLLAMA 2>/dev/null || true
    iptables -X CHAOS_OLLAMA 2>/dev/null || true
    ok "  Règles iptables supprimées"
else
    docker start "$OLLAMA_CONTAINER"
    MAX_WAIT=60
    WAITED=0
    log "  Attente readiness Ollama (max ${MAX_WAIT}s)..."
    until curl -sf --max-time 3 "http://localhost:${OLLAMA_PORT}/api/version" > /dev/null 2>&1; do
        sleep 3
        (( WAITED += 3 )) || true
        if [[ $WAITED -ge $MAX_WAIT ]]; then
            err "Ollama non prêt après ${MAX_WAIT}s"
            exit 1
        fi
    done
    ok "  Ollama prêt après ${WAITED}s"
fi

log "  Assistant health post-restauration : $(curl -sf --max-time 5 "${ASSISTANT_URL}/health" 2>/dev/null | head -c 100 || echo 'DOWN')"

ok "Chaos drill Ollama terminé avec succès"
