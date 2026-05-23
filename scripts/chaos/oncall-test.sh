#!/usr/bin/env bash
# oncall-test.sh — Test bout-en-bout de l'escalade astreinte
# 1. Envoie un faux trigger Telegram (alerte simulée)
# 2. Attend 30s
# 3. Vérifie que le webhook /oncall/ack est accessible
# 4. Affiche le résultat
# Vars env:
#   TELEGRAM_BOT_TOKEN    — token bot Telegram
#   TELEGRAM_CHAT_ID      — chat ID destinataire
#   ASSISTANT_URL         — URL du backend assistant (défaut http://localhost:8300)
#   TWILIO_ACCOUNT_SID    — SID Twilio (optionnel, pour vérification SMS)
set -euo pipefail

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { echo "[OK]  $*"; }
warn() { echo "[WARN] $*"; }
err()  { echo "[ERR] $*" >&2; }

ASSISTANT_URL="${ASSISTANT_URL:-http://localhost:8300}"
WAIT_SECONDS=30
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
HOSTNAME_SHORT="$(hostname -s 2>/dev/null || echo localhost)"

log "==> Démarrage du test d'escalade astreinte (oncall-test)"

# ── 1. Envoi faux trigger Telegram ────────────────────────────
log "==> [1/4] Envoi alerte simulée via Telegram..."

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    warn "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID non définis — notification Telegram ignorée"
    TELEGRAM_SENT=false
else
    TRIGGER_MSG="*[ONCALL TEST]* ${TIMESTAMP}
Alerte simulée depuis \`${HOSTNAME_SHORT}\`
Ceci est un test bout-en-bout de l'escalade astreinte.
Répondre /ack pour acquitter."

    TELEGRAM_RESP=$(curl -s -X POST \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${TELEGRAM_CHAT_ID}" \
        -d parse_mode="Markdown" \
        -d text="${TRIGGER_MSG}" 2>/dev/null)

    if echo "$TELEGRAM_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);exit(0 if d.get('ok') else 1)" 2>/dev/null; then
        MSG_ID=$(echo "$TELEGRAM_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result']['message_id'])" 2>/dev/null || echo "?")
        ok "  Message Telegram envoyé (ID: ${MSG_ID})"
        TELEGRAM_SENT=true
    else
        warn "  Échec envoi Telegram : ${TELEGRAM_RESP}"
        TELEGRAM_SENT=false
    fi
fi

# ── 2. Simulation trigger Alertmanager (webhook) ───────────────
log "==> [2/4] Test webhook Alertmanager → assistant (si configuré)..."
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://localhost:9093}"

FAKE_ALERT=$(cat <<EOF
[{
  "labels": {
    "alertname": "OnCallTest",
    "severity": "warning",
    "service": "oncall-test",
    "instance": "${HOSTNAME_SHORT}"
  },
  "annotations": {
    "summary": "Test astreinte ${TIMESTAMP}",
    "description": "Alerte simulée pour valider l'escalade astreinte bout-en-bout."
  },
  "startsAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "endsAt": "$(date -u -d '+5 minutes' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+5M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)",
  "generatorURL": "http://localhost:9090/fake"
}]
EOF
)

AM_RESP=$(curl -sf --max-time 5 -X POST \
    "${ALERTMANAGER_URL}/api/v2/alerts" \
    -H "Content-Type: application/json" \
    -d "$FAKE_ALERT" 2>/dev/null && echo "ok" || echo "unreachable")

if [[ "$AM_RESP" == "ok" ]]; then
    ok "  Alerte injectée dans Alertmanager (${ALERTMANAGER_URL})"
else
    warn "  Alertmanager inaccessible (${ALERTMANAGER_URL}) — test Alertmanager ignoré"
fi

# ── 3. Attente ────────────────────────────────────────────────
log "==> [3/4] Attente ${WAIT_SECONDS}s (simulation délai escalade)..."
for i in $(seq 1 $WAIT_SECONDS); do
    printf "."
    sleep 1
done
echo ""

# ── 4. Vérification webhook /oncall/ack ───────────────────────
log "==> [4/4] Vérification accessibilité du webhook /oncall/ack..."

ACK_URL="${ASSISTANT_URL}/oncall/ack"
ACK_RESP=$(curl -sf --max-time 10 -X POST "$ACK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"test\":true,\"timestamp\":\"${TIMESTAMP}\",\"source\":\"oncall-test-script\"}" \
    2>/dev/null || echo "")

ACK_STATUS="unreachable"
if [[ -n "$ACK_RESP" ]]; then
    ACK_STATUS=$(echo "$ACK_RESP" | python3 -c \
        "import sys,json;d=json.load(sys.stdin);print(d.get('status','ok'))" 2>/dev/null || echo "ok")
    ok "  /oncall/ack accessible — réponse : ${ACK_RESP:0:100}"
else
    warn "  /oncall/ack inaccessible (${ACK_URL})"
    warn "  Le endpoint /oncall/ack n'est peut-être pas encore implémenté — vérifier le runbook"
fi

# Fallback: vérifier /health
HEALTH_RESP=$(curl -sf --max-time 5 "${ASSISTANT_URL}/health" 2>/dev/null | head -c 100 || echo "DOWN")
log "  Assistant health : ${HEALTH_RESP}"

# ── Résumé ────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
echo " RÉSULTAT TEST ASTREINTE — ${TIMESTAMP}"
echo "══════════════════════════════════════════════"
echo " Telegram trigger envoyé  : ${TELEGRAM_SENT}"
echo " Alertmanager injecté     : ${AM_RESP}"
echo " /oncall/ack status       : ${ACK_STATUS}"
echo " Assistant health         : ${HEALTH_RESP}"
echo "══════════════════════════════════════════════"

if [[ "$TELEGRAM_SENT" == "true" ]]; then
    ok "Test Telegram : PASS"
    # Notifier la fin du test
    END_MSG="*[ONCALL TEST FIN]* ${TIMESTAMP}
/oncall/ack : ${ACK_STATUS}
Test astreinte terminé."
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${TELEGRAM_CHAT_ID}" \
        -d parse_mode="Markdown" \
        -d text="${END_MSG}" > /dev/null 2>&1 || true
else
    warn "Test Telegram : SKIP (token non configuré)"
fi

ok "Test astreinte bout-en-bout terminé"
