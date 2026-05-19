#!/bin/sh
set -e

OUTPUT=/storage/disk-info.json
STORAGE_PATH=${STORAGE_PATH:-/host/opt/assistant/storage}

mkdir -p /storage

while true; do
  check_path="$STORAGE_PATH"
  if [ ! -e "$check_path" ]; then
    check_path="/host"
  fi

  df_line=$(df -k "$check_path" 2>/dev/null | tail -1)
  total=$(echo "$df_line" | awk '{print $2}')
  used=$(echo "$df_line" | awk '{print $3}')
  avail=$(echo "$df_line" | awk '{print $4}')
  pct=$(echo "$df_line" | awk '{gsub(/%/,""); print $5}')
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  printf '{"total_kb":%s,"used_kb":%s,"avail_kb":%s,"use_pct":%s,"path":"%s","collected_at":"%s"}\n' \
    "${total:-0}" "${used:-0}" "${avail:-0}" "${pct:-0}" "$check_path" "$now" \
    > "$OUTPUT"

  sleep 120
done
