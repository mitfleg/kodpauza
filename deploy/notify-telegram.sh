#!/usr/bin/env bash

set -euo pipefail

env_file="${KODPAUZA_ENV_FILE:-/opt/kodpauza/.env.production}"

env_value() {
  local name="$1"
  awk -v name="$name" 'index($0, name "=") == 1 { print substr($0, length(name) + 2); exit }' \
    "$env_file"
}

message="$(cat)"
[[ -n "$message" ]] || exit 0

bot_token="$(env_value KODPAUZA_TELEGRAM_BOT_TOKEN)"
chat_id="$(env_value KODPAUZA_TELEGRAM_ADMIN_CHAT_ID)"
proxy_host="$(env_value KODPAUZA_TELEGRAM_PROXY_HOST)"
proxy_user="$(env_value KODPAUZA_TELEGRAM_PROXY_USER)"
proxy_password="$(env_value KODPAUZA_TELEGRAM_PROXY_PASSWORD)"

[[ -n "$bot_token" && -n "$chat_id" ]] || exit 0

telegram_curl=()
if [[ -n "$proxy_host" && -n "$proxy_user" && -n "$proxy_password" ]]; then
  [[ "$proxy_host" == http://* || "$proxy_host" == https://* ]] || proxy_host="http://${proxy_host}"
  telegram_curl=(--proxy "$proxy_host" --proxy-user "${proxy_user}:${proxy_password}")
fi

curl "${telegram_curl[@]}" --fail --silent --show-error --max-time 15 \
  --output /dev/null \
  --request POST \
  --data-urlencode "chat_id=${chat_id}" \
  --data-urlencode "text=${message}" \
  --data-urlencode "disable_web_page_preview=true" \
  "https://api.telegram.org/bot${bot_token}/sendMessage"

