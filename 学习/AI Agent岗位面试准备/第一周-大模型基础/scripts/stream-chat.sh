#!/usr/bin/env bash
set -euo pipefail

command -v curl >/dev/null || { echo "缺少 curl" >&2; exit 1; }

message="${1:-解释什么是 Token}"
base_url="${APP_BASE_URL:-http://localhost:8080}"

curl -N --fail-with-body --silent --show-error \
  --get \
  --data-urlencode "message=$message" \
  "${base_url%/}/api/chat/stream"
