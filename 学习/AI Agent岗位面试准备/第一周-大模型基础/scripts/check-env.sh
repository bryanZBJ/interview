#!/usr/bin/env bash
set -euo pipefail

command -v java >/dev/null || { echo "缺少 Java"; exit 1; }
command -v mvn >/dev/null || { echo "缺少 Maven"; exit 1; }
command -v python3 >/dev/null || { echo "缺少 Python 3"; exit 1; }
command -v curl >/dev/null || { echo "缺少 curl"; exit 1; }

if [[ -x /usr/libexec/java_home ]]; then
  /usr/libexec/java_home -v 17 >/dev/null 2>&1 || { echo "缺少 JDK 17"; exit 1; }
else
  java -version 2>&1 | grep -Eq 'version "17([.]|\")' || { echo "缺少 JDK 17"; exit 1; }
fi

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "未配置 DEEPSEEK_API_KEY，可先使用 Mock 模式"
else
  echo "DeepSeek Key 已配置（不会打印具体值）"
fi
