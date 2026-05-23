#!/usr/bin/env bash
# random-failure.sh — Orchestre un chaos drill aléatoire ou ciblé
# Usage  : bash scripts/chaos/random-failure.sh [--scenario <nom>]
# Scénarios disponibles : postgres qdrant minio traefik ollama network
# Vars env :
#   TELEGRAM_BOT_TOKEN      — token du bot Telegram (optionnel)
#   TELEGRAM_CHAT_ID        — chat ID destinataire (optionnel)
#   RTO_ALERT_THRESHOLD_SECONDS — seuil en secondes avant alerte (défaut 300)
set -euo pipefail

# ── Constantes ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS=(postgres qdrant minio traefik ollama network)
RTO_THRESHOLD="${RTO_ALERT_THRESHOLD_SECONDS:-300}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/tmp/chaos-drill-${TIMESTAMP}.log"
RESULT_FILE="/tmp/last-chaos-drill.json"

# ── Couleurs ──────────────────────────────────────────────────
RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[1;33m'
BLU='\033[0;34m'
RST='\033[0m'

# ── Helpers ───────────────────────────────────────────────────
log() { echo -e "${BLU}[$(date +%H:%M:%S)]${RST} $*" | tee -a "$LOG_FILE"; }
ok()  { echo -e "${GRN}[OK]${RST} $*"               | tee -a "$LOG_FILE"; }
warn(){ echo -e "${YEL}[WARN]${RST} $*"             | tee -a "$LOG_FILE"; }
err() { echo -e "${RED}[ERR]${RST} $*"              | tee -a "$LOG_FILE"; }

telegram_notify() {
    local msg="$1"
    if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d chat_id="${TELEGRAM_CHAT_ID}" \
            -d parse_mode="Markdown" \
            -d text="${msg}" > /dev/null 2>&1 || warn "Telegram notification failed"
    else
        warn "TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID non configurés — alerte ignorée"
    fi
}

write_result() {
    local scenario="$1" status="$2" rto="$3" rto_exceeded="$4"
    cat > "$RESULT_FILE" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "scenario": "${scenario}",
  "status": "${status}",
  "rto_seconds": ${rto},
  "rto_threshold": ${RTO_THRESHOLD},
  "rto_exceeded": ${rto_exceeded},
  "log_file": "${LOG_FILE}"
}
EOF
    log "Résultat JSON écrit dans ${RESULT_FILE}"
}

# ── Parsing arguments ─────────────────────────────────────────
SCENARIO=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --scenario)
            SCENARIO="${2:-}"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--scenario <postgres|qdrant|minio|traefik|ollama|network>]"
            exit 0
            ;;
        *)
            err "Argument inconnu : $1"
            exit 1
            ;;
    esac
done

# ── Sélection du scénario ─────────────────────────────────────
if [[ -z "$SCENARIO" ]]; then
    RANDOM_INDEX=$(( RANDOM % ${#SCENARIOS[@]} ))
    SCENARIO="${SCENARIOS[$RANDOM_INDEX]}"
    log "Scénario tiré au sort : ${SCENARIO}"
else
    # Validation
    valid=false
    for s in "${SCENARIOS[@]}"; do
        [[ "$s" == "$SCENARIO" ]] && valid=true && break
    done
    if [[ "$valid" != "true" ]]; then
        err "Scénario inconnu : ${SCENARIO}. Valeurs possibles : ${SCENARIOS[*]}"
        exit 1
    fi
    log "Scénario ciblé : ${SCENARIO}"
fi

SCENARIO_SCRIPT="${SCRIPT_DIR}/${SCENARIO}-chaos.sh"
if [[ ! -f "$SCENARIO_SCRIPT" ]]; then
    err "Script introuvable : ${SCENARIO_SCRIPT}"
    exit 1
fi

# ── Notification de démarrage ─────────────────────────────────
HOSTNAME_SHORT="$(hostname -s 2>/dev/null || echo localhost)"
START_MSG="*[CHAOS DRILL]* Démarrage du scénario \`${SCENARIO}\` sur \`${HOSTNAME_SHORT}\`
Log: \`${LOG_FILE}\`"
telegram_notify "$START_MSG"
log "==> Début du chaos drill : ${SCENARIO} (seuil RTO ${RTO_THRESHOLD}s)"

# ── Exécution + mesure du RTO ────────────────────────────────
T_START=$(date +%s)
EXIT_CODE=0
bash "$SCENARIO_SCRIPT" 2>&1 | tee -a "$LOG_FILE" || EXIT_CODE=$?
T_END=$(date +%s)
RTO=$(( T_END - T_START ))

# ── Évaluation résultat ───────────────────────────────────────
RTO_EXCEEDED="false"
FINAL_STATUS="success"

if [[ $EXIT_CODE -ne 0 ]]; then
    FINAL_STATUS="failed"
    err "Le scénario ${SCENARIO} a échoué (code ${EXIT_CODE}) — RTO mesuré : ${RTO}s"
fi

if [[ $RTO -gt $RTO_THRESHOLD ]]; then
    RTO_EXCEEDED="true"
    warn "RTO dépassé : ${RTO}s > seuil ${RTO_THRESHOLD}s"

    # Auto-rollback : tenter de redémarrer le service
    log "Auto-rollback : tentative de redémarrage du service ${SCENARIO}..."
    case "$SCENARIO" in
        postgres)
            docker compose -f "$(pwd)/forge/docker-compose.standalone.yml" -p forge start postgres 2>/dev/null \
                || docker start forge-postgres-1 2>/dev/null || warn "Rollback postgres échoué"
            ;;
        qdrant)
            docker compose -f "$(pwd)/mempalace/docker-compose.yml" -p mempalace start qdrant 2>/dev/null \
                || docker start mempalace-qdrant-1 2>/dev/null || warn "Rollback qdrant échoué"
            ;;
        minio)
            docker compose -f "$(pwd)/mempalace/docker-compose.yml" -p mempalace start minio 2>/dev/null \
                || docker start mempalace-minio-1 2>/dev/null || warn "Rollback minio échoué"
            ;;
        ollama)
            # Flush iptables si règles chaos toujours actives
            if command -v iptables > /dev/null 2>&1; then
                iptables -F CHAOS_OLLAMA 2>/dev/null || true
                iptables -D OUTPUT -j CHAOS_OLLAMA 2>/dev/null || true
                iptables -X CHAOS_OLLAMA 2>/dev/null || true
            fi
            docker start ollama-bridge 2>/dev/null || warn "Rollback ollama-bridge échoué"
            ;;
        network)
            if command -v iptables > /dev/null 2>&1; then
                iptables -F CHAOS_NET 2>/dev/null || true
                iptables -D OUTPUT -j CHAOS_NET 2>/dev/null || true
                iptables -X CHAOS_NET 2>/dev/null || true
            fi
            ;;
        *)
            warn "Pas de rollback auto pour le scénario ${SCENARIO}"
            ;;
    esac

    ALERT_MSG="*[CHAOS DRILL - ALERTE RTO]* Scénario \`${SCENARIO}\` sur \`${HOSTNAME_SHORT}\`
RTO mesuré : *${RTO}s* > seuil *${RTO_THRESHOLD}s*
Status : ${FINAL_STATUS}
Auto-rollback déclenché.
Log : \`${LOG_FILE}\`"
    telegram_notify "$ALERT_MSG"
elif [[ "$FINAL_STATUS" == "success" ]]; then
    ok "Scénario ${SCENARIO} réussi — RTO : ${RTO}s / seuil ${RTO_THRESHOLD}s"
fi

# ── Notification de fin ───────────────────────────────────────
ICON="✅"
[[ "$FINAL_STATUS" != "success" ]] && ICON="❌"
[[ "$RTO_EXCEEDED" == "true" ]]   && ICON="⚠️"

END_MSG="${ICON} *[CHAOS DRILL FIN]* Scénario \`${SCENARIO}\` sur \`${HOSTNAME_SHORT}\`
Status : ${FINAL_STATUS}
RTO : ${RTO}s (seuil ${RTO_THRESHOLD}s)
RTO dépassé : ${RTO_EXCEEDED}"
telegram_notify "$END_MSG"

# ── Écriture résultat ─────────────────────────────────────────
write_result "$SCENARIO" "$FINAL_STATUS" "$RTO" "$RTO_EXCEEDED"

log "==> Chaos drill terminé — log complet : ${LOG_FILE}"
if [[ "$FINAL_STATUS" != "success" ]]; then
    exit 1
fi
