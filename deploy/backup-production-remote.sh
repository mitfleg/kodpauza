#!/usr/bin/env bash

set -euo pipefail

mode="${1:-}"
postgres_container="${KODPAUZA_POSTGRES_CONTAINER:-kodpauza-postgres-1}"
key_file="${KODPAUZA_BACKUP_KEY_FILE:-/opt/kodpauza/.backup-encryption-passphrase}"

[[ -s "$key_file" ]] || {
  echo "Backup encryption key is missing on production." >&2
  exit 1
}

[[ "$(wc -c < "$key_file")" -ge 32 ]] || {
  echo "Backup encryption key must contain at least 32 bytes." >&2
  exit 1
}

case "$mode" in
  create)
    docker exec "$postgres_container" sh -lc \
      'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges' \
      | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 \
          -pass "file:${key_file}"
    ;;

  restore-test)
    restore_db="${2:-}"
    [[ "$restore_db" =~ ^[a-z0-9_]+$ ]] || {
      echo "Invalid restore database name." >&2
      exit 1
    }

    cleanup() {
      docker exec "$postgres_container" sh -lc \
        'dropdb -U "$POSTGRES_USER" --if-exists --force "$1"' sh "$restore_db" \
        >/dev/null 2>&1 || true
    }
    trap cleanup EXIT

    cleanup
    docker exec "$postgres_container" sh -lc \
      'createdb -U "$POSTGRES_USER" "$1"' sh "$restore_db"

    openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
      -pass "file:${key_file}" \
      | docker exec -i "$postgres_container" sh -lc \
          'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges' \
          sh "$restore_db"

    tables="$(docker exec "$postgres_container" sh -lc \
      'psql -U "$POSTGRES_USER" -d "$1" -Atc \
        "SELECT count(*) FROM pg_tables WHERE schemaname = '\''public'\'';"' \
      sh "$restore_db")"
    [[ "$tables" =~ ^[0-9]+$ ]] && (( tables >= 10 )) || {
      echo "Restore test returned an invalid table count: ${tables}" >&2
      exit 1
    }

    echo "Restore test passed on production: ${tables} public tables."
    ;;

  *)
    echo "Usage: $0 {create|restore-test <database-name>}" >&2
    exit 2
    ;;
esac
