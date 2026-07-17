#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
key_file="${repo_root}/backup-encryption-passphrase"
backup_host="${BACKUP_PROD_HOST:-203.0.113.10}"
backup_user="${BACKUP_PROD_USER:-deploy}"
backup_ssh_key="${BACKUP_PROD_SSH_KEY:-${HOME}/.ssh/kodpauza_github_actions}"

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

if [[ ! -s "$key_file" ]]; then
  umask 077
  openssl rand -base64 48 > "$key_file"
  chmod 600 "$key_file"
fi

[[ "$(wc -c < "$key_file")" -ge 32 ]] || {
  echo 'Ключ шифрования backup должен содержать минимум 32 байта.' >&2
  exit 1
}

[[ -r "$backup_ssh_key" ]] || {
  echo "Не найден SSH-ключ: ${backup_ssh_key}" >&2
  exit 1
}

printf '%s' "$access_key" | gh secret set BACKUP_S3_ACCESS_KEY --env production
printf '%s' "$secret_key" | gh secret set BACKUP_S3_SECRET_KEY --env production
unset access_key secret_key

ssh -i "$backup_ssh_key" -o IdentitiesOnly=yes \
  "${backup_user}@${backup_host}" \
  'umask 077; cat > /opt/kodpauza/.backup-encryption-passphrase; \
    chmod 600 /opt/kodpauza/.backup-encryption-passphrase' < "$key_file"

gh workflow run backup-production.yml --ref main

echo "Backup secrets configured. Recovery passphrase: ${key_file}"
echo 'Ключ шифрования установлен только на production-сервере и локальном компьютере.'
echo 'Сохраните этот файл в менеджере паролей или другом защищенном месте.'
