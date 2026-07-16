#!/usr/bin/env bash

set -u

deploy_dir="${KODPAUZA_DEPLOY_DIR:-/opt/kodpauza}"
state_dir="${KODPAUZA_MONITOR_STATE_DIR:-${deploy_dir}/monitor-state}"
notify_script="${KODPAUZA_NOTIFY_SCRIPT:-/home/deploy/notify-telegram.sh}"
disk_threshold="${KODPAUZA_MONITOR_DISK_PERCENT:-85}"
fraud_threshold="${KODPAUZA_MONITOR_FRAUD_15M:-5}"
backup_max_age="${KODPAUZA_MONITOR_BACKUP_MAX_AGE_SECONDS:-108000}"

mkdir -p "$state_dir"
chmod 700 "$state_dir"
[[ -f "$state_dir/started-at" ]] || date +%s >"$state_dir/started-at"

send() {
  printf '%s\n' "$1" | "$notify_script" >/dev/null 2>&1
}

raise_alert() {
  local key="$1"
  local message="$2"
  if [[ ! -f "$state_dir/$key" ]] && send "$message"; then
    date +%s >"$state_dir/$key"
  fi
}

clear_alert() {
  local key="$1"
  local message="$2"
  if [[ -f "$state_dir/$key" ]]; then
    send "$message" && rm -f "$state_dir/$key"
  fi
}

if curl --fail --silent --max-time 8 http://127.0.0.1:4000/ready >/dev/null; then
  clear_alert api-unavailable '✅ Kodpauza API снова отвечает и проходит readiness-проверку.'
else
  raise_alert api-unavailable '🚨 Kodpauza: production API не отвечает или не готов.'
fi

disk_used="$(df -P / | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')"
if [[ "$disk_used" =~ ^[0-9]+$ ]] && (( disk_used >= disk_threshold )); then
  raise_alert disk-space "🚨 Kodpauza: диск сервера заполнен на ${disk_used}% (порог ${disk_threshold}%)."
else
  clear_alert disk-space "✅ Kodpauza: место на диске вернулось ниже ${disk_threshold}%."
fi

now="$(date +%s)"
backup_marker="${deploy_dir}/backup.last-success"
backup_attempt_marker="${deploy_dir}/backup.last-attempt"
started_at="$(cat "$state_dir/started-at" 2>/dev/null || echo "$now")"
backup_at="$(cat "$backup_marker" 2>/dev/null || echo 0)"
backup_attempt_at="$(cat "$backup_attempt_marker" 2>/dev/null || echo 0)"
if [[ "$backup_attempt_at" =~ ^[0-9]+$ ]] && [[ "$backup_at" =~ ^[0-9]+$ ]] \
  && (( backup_attempt_at > backup_at && now - backup_attempt_at > 1200 )); then
  raise_alert backup-failed '🚨 Kodpauza: последний запуск backup не завершил загрузку и тест восстановления.'
else
  clear_alert backup-failed '✅ Kodpauza: backup снова загружается и проходит тест восстановления.'
fi
if [[ "$backup_at" =~ ^[0-9]+$ ]] && (( backup_at > 0 )); then
  backup_age=$((now - backup_at))
  if (( backup_age > backup_max_age )); then
    raise_alert backup-stale "🚨 Kodpauza: последний проверенный backup старше 30 часов."
  else
    clear_alert backup-stale '✅ Kodpauza: ежедневные backup снова выполняются вовремя.'
  fi
elif (( now - started_at > backup_max_age )); then
  raise_alert backup-stale '🚨 Kodpauza: нет ни одного подтвержденного offsite backup.'
fi

cd "$deploy_dir" || exit 0
compose=(docker compose --env-file .env.production --env-file release.env -f compose.production.yml)

if "${compose[@]}" logs --since 10m --no-color api 2>/dev/null \
  | grep -Eq 'YooKassa (payment operation|webhook reconciliation) failed'; then
  raise_alert yookassa-errors '🚨 Kodpauza: за последние 10 минут обнаружены ошибки ЮKassa. Проверьте платежи в админке.'
else
  clear_alert yookassa-errors '✅ Kodpauza: новых ошибок ЮKassa больше нет.'
fi

fraud_count="$("${compose[@]}" exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc '\''SELECT count(*) FROM "FraudFlag" WHERE "createdAt" >= now() - interval '\''\''\''15 minutes'\''\''\'';'\''' \
  2>/dev/null || echo 0)"
if [[ "$fraud_count" =~ ^[0-9]+$ ]] && (( fraud_count >= fraud_threshold )); then
  raise_alert fraud-spike "🚨 Kodpauza: ${fraud_count} антифрод-сигналов за 15 минут (порог ${fraud_threshold})."
else
  clear_alert fraud-spike '✅ Kodpauza: частота антифрод-сигналов вернулась к норме.'
fi
