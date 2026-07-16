#!/usr/bin/env bash

set -euo pipefail

deploy_dir="${KODPAUZA_DEPLOY_DIR:-/opt/kodpauza}"
env_file="${deploy_dir}/.env.production"
compose_file="${deploy_dir}/compose.production.yml"
release_file="${deploy_dir}/release.env"

env_value() {
  local name="$1"
  awk -v name="$name" 'index($0, name "=") == 1 { print substr($0, length(name) + 2); exit }' \
    "$env_file"
}

for required_file in "$env_file" "$compose_file" "$release_file"; do
  if [[ ! -f "$required_file" ]]; then
    echo "Не найден обязательный файл: $required_file" >&2
    exit 1
  fi
done

read -rsp "Вставьте токен Telegram-бота: " bot_token
echo

if [[ -z "$bot_token" ]]; then
  echo "Токен не может быть пустым." >&2
  exit 1
fi

proxy_host="$(env_value KODPAUZA_TELEGRAM_PROXY_HOST)"
proxy_user="$(env_value KODPAUZA_TELEGRAM_PROXY_USER)"
proxy_password="$(env_value KODPAUZA_TELEGRAM_PROXY_PASSWORD)"
if [[ -z "$proxy_host" && -z "$proxy_user" && -z "$proxy_password" ]]; then
  read -rp "Прокси Telegram (host:port): " proxy_host
  read -rp "Логин прокси: " proxy_user
  read -rsp "Пароль прокси: " proxy_password
  echo
fi
telegram_curl=()
if [[ -n "$proxy_host" || -n "$proxy_user" || -n "$proxy_password" ]]; then
  if [[ -z "$proxy_host" || -z "$proxy_user" || -z "$proxy_password" ]]; then
    echo "Прокси Telegram настроен не полностью." >&2
    exit 1
  fi
  if [[ "$proxy_host" != http://* && "$proxy_host" != https://* ]]; then
    proxy_host="http://${proxy_host}"
  fi
  telegram_curl=(--proxy "$proxy_host" --proxy-user "${proxy_user}:${proxy_password}")
fi

bot_response="$(curl "${telegram_curl[@]}" --fail --silent --show-error --max-time 15 \
  "https://api.telegram.org/bot${bot_token}/getMe")"
if ! grep -q '"ok":true' <<<"$bot_response"; then
  echo "Telegram не принял токен бота." >&2
  exit 1
fi

updates_response="$(curl "${telegram_curl[@]}" --fail --silent --show-error --max-time 15 \
  "https://api.telegram.org/bot${bot_token}/getUpdates")"
chat_id="$(sed -n 's/.*"chat":{"id":\(-\{0,1\}[0-9][0-9]*\),.*/\1/p' <<<"$updates_response")"

if [[ -z "$chat_id" ]]; then
  echo "Не найден chat ID. Отправьте боту /start и запустите настройщик ещё раз." >&2
  exit 1
fi

umask 077
env_tmp="$(mktemp "${deploy_dir}/.env.production.telegram.XXXXXX")"
cleanup() {
  rm -f "$env_tmp"
  unset bot_token proxy_password
}
trap cleanup EXIT

awk '
  !/^KODPAUZA_TELEGRAM_BOT_TOKEN=/ &&
  !/^KODPAUZA_TELEGRAM_ADMIN_CHAT_ID=/ &&
  !/^KODPAUZA_TELEGRAM_NOTIFICATION_TIMEOUT_MS=/ &&
  !/^KODPAUZA_TELEGRAM_PROXY_HOST=/ &&
  !/^KODPAUZA_TELEGRAM_PROXY_USER=/ &&
  !/^KODPAUZA_TELEGRAM_PROXY_PASSWORD=/
' "$env_file" >"$env_tmp"

printf '\nKODPAUZA_TELEGRAM_BOT_TOKEN=%s\n' "$bot_token" >>"$env_tmp"
printf 'KODPAUZA_TELEGRAM_ADMIN_CHAT_ID=%s\n' "$chat_id" >>"$env_tmp"
printf 'KODPAUZA_TELEGRAM_NOTIFICATION_TIMEOUT_MS=8000\n' >>"$env_tmp"
printf 'KODPAUZA_TELEGRAM_PROXY_HOST=%s\n' "${proxy_host#http://}" >>"$env_tmp"
printf 'KODPAUZA_TELEGRAM_PROXY_USER=%s\n' "$proxy_user" >>"$env_tmp"
printf 'KODPAUZA_TELEGRAM_PROXY_PASSWORD=%s\n' "$proxy_password" >>"$env_tmp"
chmod 600 "$env_tmp"
mv "$env_tmp" "$env_file"

cd "$deploy_dir"
docker compose \
  --env-file .env.production \
  --env-file release.env \
  -f compose.production.yml \
  up -d --no-deps --force-recreate api

for attempt in {1..24}; do
  if curl --fail --silent --show-error --max-time 5 \
    http://127.0.0.1:4000/ready >/dev/null; then
    break
  fi
  if [[ "$attempt" == 24 ]]; then
    echo "API не перешёл в состояние ready." >&2
    exit 1
  fi
  sleep 5
done

test_message="$(printf '%s\n' \
  '✅ Telegram-уведомления Kodpauza подключены' \
  '' \
  'Теперь сюда придёт сообщение, когда новая версия Codex или Claude Code потребует патча.')"

send_response="$(curl "${telegram_curl[@]}" --fail --silent --show-error --max-time 15 \
  -X POST \
  -H 'Content-Type: application/json' \
  --data "$(printf '{\"chat_id\":\"%s\",\"text\":\"%s\"}' \
    "$chat_id" "$(sed ':a;N;$!ba;s/\n/\\n/g' <<<"$test_message")")" \
  "https://api.telegram.org/bot${bot_token}/sendMessage")"

if ! grep -q '"ok":true' <<<"$send_response"; then
  echo "Настройки сохранены, но тестовое сообщение не отправлено." >&2
  exit 1
fi

echo "Telegram-уведомления настроены. Тестовое сообщение отправлено."
