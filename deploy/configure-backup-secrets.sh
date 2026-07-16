#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
key_dir="${HOME}/.kodpauza"
key_file="${key_dir}/backup-encryption-passphrase"

command -v gh >/dev/null || { echo 'Не найден GitHub CLI (gh).' >&2; exit 1; }
cd "$repo_root"
gh auth status >/dev/null

read -rsp 'S3 Access Key: ' access_key
echo
read -rsp 'S3 Secret Access Key: ' secret_key
echo
[[ -n "$access_key" && -n "$secret_key" ]] || {
  echo 'Оба ключа S3 обязательны.' >&2
  exit 1
}

install -d -m 700 "$key_dir"
if [[ ! -s "$key_file" ]]; then
  umask 077
  openssl rand -base64 48 > "$key_file"
  chmod 600 "$key_file"
fi

printf '%s' "$access_key" | gh secret set BACKUP_S3_ACCESS_KEY --env production
printf '%s' "$secret_key" | gh secret set BACKUP_S3_SECRET_KEY --env production
gh secret set BACKUP_ENCRYPTION_PASSPHRASE --env production < "$key_file"
unset access_key secret_key

gh workflow run backup-production.yml --ref main

echo "Backup secrets configured. Recovery passphrase: ${key_file}"
echo 'Сохраните этот файл в менеджере паролей или другом защищенном месте.'
