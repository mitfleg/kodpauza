#!/usr/bin/env bash

set -euo pipefail

env_file="${1:-/opt/kodpauza/.env.production}"

if [[ ! -f "$env_file" ]]; then
  printf 'Environment file not found: %s\n' "$env_file" >&2
  exit 1
fi

if [[ ! -w "$env_file" ]]; then
  printf 'Environment file is not writable: %s\n' "$env_file" >&2
  exit 1
fi

read -rsp 'Yandex SmartCaptcha server key (ysc2_...): ' captcha_secret
printf '\n'
if [[ "$captcha_secret" != ysc2_* ]]; then
  printf 'The SmartCaptcha server key must start with ysc2_.\n' >&2
  exit 1
fi

read -rsp 'Timeweb password for noreply@kodpauza.ru: ' smtp_password
printf '\n'
if [[ -z "$smtp_password" ]]; then
  printf 'The Timeweb mailbox password cannot be empty.\n' >&2
  exit 1
fi

set_env_value() {
  local key="$1"
  local value="$2"
  local temporary_file
  local replaced='false'

  temporary_file="$(mktemp "${env_file}.tmp.XXXXXX")"
  chmod 600 "$temporary_file"

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "${key}="* ]]; then
      printf '%s=%s\n' "$key" "$value" >> "$temporary_file"
      replaced='true'
    else
      printf '%s\n' "$line" >> "$temporary_file"
    fi
  done < "$env_file"

  if [[ "$replaced" == 'false' ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$temporary_file"
  fi

  mv "$temporary_file" "$env_file"
  chmod 600 "$env_file"
}

set_env_value KODPAUZA_CAPTCHA_SECRET_KEY "$captcha_secret"
set_env_value KODPAUZA_CAPTCHA_VERIFY_URL 'https://smartcaptcha.cloud.yandex.ru/validate'
set_env_value KODPAUZA_CAPTCHA_EXPECTED_HOSTS 'kodpauza.ru'
set_env_value KODPAUZA_SMTP_HOST 'smtp.timeweb.ru'
set_env_value KODPAUZA_SMTP_PORT '587'
set_env_value KODPAUZA_SMTP_SECURE 'false'
set_env_value KODPAUZA_SMTP_REQUIRE_TLS 'true'
set_env_value KODPAUZA_SMTP_USER 'noreply@kodpauza.ru'
set_env_value KODPAUZA_SMTP_PASSWORD "$smtp_password"
set_env_value KODPAUZA_SMTP_FROM 'Kodpauza <noreply@kodpauza.ru>'

unset captcha_secret smtp_password

printf 'Yandex SmartCaptcha and Timeweb SMTP settings were written to %s.\n' "$env_file"
printf 'The secret values were not printed.\n'
