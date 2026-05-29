global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'job']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: telegram
  routes:
    - match:
        degraded: "true"
      receiver: degraded-webhook
      group_wait: 10s
      repeat_interval: 10m
      continue: true

receivers:
  - name: telegram
    telegram_configs:
      - bot_token: "${TELEGRAM_BOT_TOKEN}"
        chat_id: ${TELEGRAM_CHAT_ID}
        parse_mode: HTML
        message: |
          {{ if eq .Status "firing" }}🔴{{ else }}✅{{ end }} <b>{{ .GroupLabels.alertname }}</b>
          {{ range .Alerts -}}
          📌 {{ .Annotations.summary }}
          {{ .Annotations.description }}
          {{ end }}

  - name: degraded-webhook
    webhook_configs:
      - url: "http://assistant:8000/admin/degraded/auto?token=${DEGRADED_WEBHOOK_TOKEN}"
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: ['alertname', 'job']
