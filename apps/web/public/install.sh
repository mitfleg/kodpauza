#!/bin/sh

set -u

EXTENSION_ID="kodpauza.kodpauza-vscode"
BASE_URL="${KODPAUZA_BASE_URL:-https://kodpauza.ru}"
BASE_URL="${BASE_URL%/}"
VSIX_URL="${BASE_URL}/downloads/kodpauza.vsix"
CHECKSUM_URL="${BASE_URL}/downloads/kodpauza-vsix.sha256"
VERSION_URL="${BASE_URL}/downloads/kodpauza-version.txt"
KODPAUZA_HOME="${KODPAUZA_HOME:-$HOME/.kodpauza}"
INSTALL_SOURCE_DIR="$KODPAUZA_HOME/install-sources"
UPDATE_CACHE_DIR="$KODPAUZA_HOME/update-cache"
EDITOR_FILTER="all"
ACTION="install"
DRY_RUN="0"
TMP_DIR=""
VSIX_PATH=""
FOUND_COUNT=0
SUCCESS_COUNT=0

if [ -t 1 ]; then
  GREEN='\033[32m'
  BLUE='\033[36m'
  YELLOW='\033[33m'
  RED='\033[31m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN=''
  BLUE=''
  YELLOW=''
  RED=''
  BOLD=''
  RESET=''
fi

print_info() { printf "%b→%b %s\n" "$BLUE" "$RESET" "$1"; }
print_ok() { printf "%b✓%b %s\n" "$GREEN" "$RESET" "$1"; }
print_warn() { printf "%b!%b %s\n" "$YELLOW" "$RESET" "$1"; }
print_error() { printf "%b✕%b %s\n" "$RED" "$RESET" "$1" >&2; }

usage() {
  cat <<'EOF'
Kodpauza installer

Usage:
  install.sh [--editor all|vscode|cursor|vscodium] [--dry-run] [--uninstall]

Options:
  --editor NAME  Install only into the selected editor.
  --dry-run      Show what would be changed without installing anything.
  --uninstall    Remove Kodpauza from the selected editors.
  --help         Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --editor)
      [ "$#" -ge 2 ] || { print_error "После --editor укажите редактор."; exit 2; }
      EDITOR_FILTER="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    --uninstall)
      ACTION="uninstall"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      print_error "Неизвестный параметр: $1"
      usage
      exit 2
      ;;
  esac
done

case "$EDITOR_FILTER" in
  all|vscode|cursor|vscodium) ;;
  *) print_error "Поддерживаются: all, vscode, cursor, vscodium."; exit 2 ;;
esac

cleanup() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT HUP INT TERM

command_path() {
  if command -v "$1" >/dev/null 2>&1; then
    command -v "$1"
    return 0
  fi
  return 1
}

first_executable() {
  for candidate in "$@"; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

find_vscode() {
  command_path code || first_executable \
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
    "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
    "/usr/share/code/bin/code" \
    "/snap/bin/code"
}

find_cursor() {
  command_path cursor || first_executable \
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
    "$HOME/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
    "/usr/share/cursor/bin/cursor"
}

find_vscodium() {
  command_path codium || first_executable \
    "/Applications/VSCodium.app/Contents/Resources/app/bin/codium" \
    "$HOME/Applications/VSCodium.app/Contents/Resources/app/bin/codium" \
    "/usr/share/codium/bin/codium"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    return 1
  fi
}

download_vsix() {
  if [ -n "$VSIX_PATH" ] && [ -s "$VSIX_PATH" ]; then
    return 0
  fi
  command -v curl >/dev/null 2>&1 || {
    print_error "Для резервной установки нужен curl."
    return 1
  }
  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kodpauza.XXXXXX")" || return 1
  VSIX_PATH="$TMP_DIR/kodpauza.vsix"
  print_info "Магазин недоступен. Загружаю проверенный VSIX с kodpauza.ru…"
  curl -fL --retry 2 --connect-timeout 10 --max-time 120 \
    "$VSIX_URL" -o "$VSIX_PATH" || {
      print_error "Не удалось скачать Kodpauza."
      return 1
    }
  download_expected_sha="$(curl -fsSL --retry 2 --connect-timeout 10 --max-time 20 "$CHECKSUM_URL" 2>/dev/null | awk 'NR == 1 { print $1 }')"
  download_actual_sha="$(sha256_file "$VSIX_PATH" 2>/dev/null || true)"
  download_expected_sha="$(printf '%s' "$download_expected_sha" | tr 'A-F' 'a-f')"
  download_actual_sha="$(printf '%s' "$download_actual_sha" | tr 'A-F' 'a-f')"
  if [ "${#download_expected_sha}" -ne 64 ] || [ "${#download_actual_sha}" -ne 64 ] || [ "$download_expected_sha" != "$download_actual_sha" ]; then
    print_error "Контрольная сумма VSIX не совпала. Установка остановлена."
    return 1
  fi
  short_hash="$(printf '%.16s' "$download_actual_sha")"
  print_ok "Целостность VSIX подтверждена: ${short_hash}…"
}

expected_version() {
  command -v curl >/dev/null 2>&1 || return 1
  value="$(curl -fsSL --retry 1 --connect-timeout 5 --max-time 10 "$VERSION_URL" 2>/dev/null | tr -d '\r\n')"
  valid_version "$value" || return 1
  printf '%s\n' "$value"
}

valid_version() {
  printf '%s\n' "$1" | awk '/^[0-9]+\.[0-9]+\.[0-9]+$/ { valid = 1 } END { exit !valid }'
}

version_at_least() {
  valid_version "$1" && valid_version "$2" || return 1
  awk -v current="$1" -v required="$2" 'BEGIN {
    split(current, a, "."); split(required, b, ".");
    for (i = 1; i <= 3; i += 1) {
      if ((a[i] + 0) > (b[i] + 0)) exit 0;
      if ((a[i] + 0) < (b[i] + 0)) exit 1;
    }
    exit 0;
  }'
}

installed_version() {
  "$1" --list-extensions --show-versions 2>/dev/null \
    | awk -F@ -v id="$EXTENSION_ID" 'tolower($1) == tolower(id) { print $2; exit }'
}

mark_fallback_install() {
  mkdir -p "$INSTALL_SOURCE_DIR" || return 1
  printf 'vsix\n' > "$INSTALL_SOURCE_DIR/$1.vsix"
}

cache_fallback_package() {
  version="$1"
  valid_version "$version" || return 1
  mkdir -p "$UPDATE_CACHE_DIR" || return 1
  cached="$UPDATE_CACHE_DIR/kodpauza-$version.vsix"
  cp "$VSIX_PATH" "$cached.tmp" || return 1
  chmod 600 "$cached.tmp" 2>/dev/null || true
  mv "$cached.tmp" "$cached"
}

clear_fallback_marker() {
  rm -f "$INSTALL_SOURCE_DIR/$1.vsix" 2>/dev/null || true
}

process_editor() {
  key="$1"
  label="$2"
  cli="$3"
  FOUND_COUNT=$((FOUND_COUNT + 1))

  if [ "$DRY_RUN" = "1" ]; then
    print_ok "$label найден: $cli"
    if [ "$ACTION" = "uninstall" ]; then
      print_info "$label: расширение было бы удалено."
    else
      print_info "$label: расширение было бы установлено или обновлено."
    fi
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    return 0
  fi

  if [ "$ACTION" = "uninstall" ]; then
    if "$cli" --uninstall-extension "$EXTENSION_ID" >/dev/null 2>&1; then
      clear_fallback_marker "$key"
      print_ok "$label: Kodpauza удалена."
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
      print_warn "$label: Kodpauza не установлена или редактор отказал в удалении."
    fi
    return 0
  fi

  expected=""
  print_info "$label: устанавливаю Kodpauza из магазина расширений…"
  if "$cli" --install-extension "$EXTENSION_ID" --force >/dev/null 2>&1; then
    version="$(installed_version "$cli")"
    expected="$(expected_version 2>/dev/null || true)"
    if [ -z "$expected" ] || version_at_least "$version" "$expected"; then
      clear_fallback_marker "$key"
      print_ok "$label: Kodpauza${version:+ $version} установлена, автообновления включены."
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      return 0
    fi
    print_warn "$label: в магазине пока версия ${version:-неизвестна}, нужна $expected."
  fi

  if ! download_vsix; then
    print_error "$label: установить Kodpauza не удалось."
    return 0
  fi
  fallback_version="${expected:-$(expected_version 2>/dev/null || true)}"
  if ! cache_fallback_package "$fallback_version"; then
    print_error "$label: не удалось сохранить проверенный пакет для возможного отката."
    return 0
  fi

  if "$cli" --install-extension "$VSIX_PATH" --force >/dev/null 2>&1; then
    version="$(installed_version "$cli")"
    mark_fallback_install "$key" || {
      print_error "$label: расширение установлено, но не удалось включить проверку обновлений."
      return 0
    }
    print_ok "$label: Kodpauza${version:+ $version} установлена из резервного пакета."
    print_ok "$label: проверка подписанных обновлений включена."
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    print_error "$label: установить Kodpauza не удалось."
  fi
}

process_if_selected() {
  key="$1"
  label="$2"
  finder="$3"
  if [ "$EDITOR_FILTER" != "all" ] && [ "$EDITOR_FILTER" != "$key" ]; then
    return 0
  fi
  cli="$($finder 2>/dev/null || true)"
  if [ -n "$cli" ]; then
    process_editor "$key" "$label" "$cli"
  elif [ "$EDITOR_FILTER" = "$key" ]; then
    print_error "$label не найден. Установите редактор или добавьте его CLI в PATH."
  fi
}

printf '\n%bKodpauza%b · установка расширения\n' "$BOLD" "$RESET"
printf 'VS Code и Cursor без ручной загрузки VSIX.\n\n'

process_if_selected vscode "Visual Studio Code" find_vscode
process_if_selected cursor "Cursor" find_cursor
process_if_selected vscodium "VSCodium" find_vscodium

printf '\n'
if [ "$FOUND_COUNT" -eq 0 ]; then
  print_error "VS Code, Cursor или VSCodium не найдены."
  printf 'Установите редактор и повторите эту же команду.\n'
  exit 1
fi
if [ "$SUCCESS_COUNT" -eq 0 ]; then
  print_error "Установка не завершена ни в одном редакторе."
  exit 1
fi
if [ "$ACTION" = "install" ] && [ "$DRY_RUN" != "1" ]; then
  print_info "Если редактор был открыт, перезапустите его окно."
  printf 'Затем откройте палитру команд и выполните «Kodpauza: Войти».\n'
fi
