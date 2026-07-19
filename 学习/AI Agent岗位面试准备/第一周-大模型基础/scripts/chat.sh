#!/usr/bin/env bash
set -euo pipefail

command -v python3 >/dev/null || { echo "缺少 Python 3" >&2; exit 1; }
command -v curl >/dev/null || { echo "缺少 curl" >&2; exit 1; }

message="${1:-解释什么是 Token}"
base_url="${APP_BASE_URL:-http://localhost:8080}"
payload="$(python3 -c 'import json, sys; print(json.dumps({"message": sys.argv[1]}, ensure_ascii=False))' "$message")"

curl --fail-with-body --silent --show-error \
  --request POST \
  --header 'Content-Type: application/json' \
  --data-binary "$payload" \
  "${base_url%/}/api/chat"
printf '\n'
