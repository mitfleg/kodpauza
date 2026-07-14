const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const vsixPath = path.join(root, 'packages', 'vscode-extension', 'dist', 'kodpauza.vsix');
const settingsPath = process.env.KODPAUZA_CURSOR_SETTINGS || defaultCursorSettingsPath();
const editorCli = process.env.KODPAUZA_EDITOR_CLI || 'cursor';

if (!fs.existsSync(vsixPath)) {
  fail(`VSIX не найден: ${vsixPath}`);
}

configureLocalEndpoints(settingsPath);

const installed = spawnSync(editorCli, ['--install-extension', vsixPath, '--force'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});
if (installed.error) {
  fail(`Не удалось запустить ${editorCli}: ${installed.error.message}`);
}
if (installed.status !== 0) {
  process.exit(installed.status || 1);
}

console.log(`Kodpauza установлена для локального стенда.`);
console.log(`API: http://localhost:4000`);
console.log(`Кабинет: http://localhost:3000`);
console.log(`Настройки: ${settingsPath}`);
console.log('В Cursor выполните Developer: Reload Window.');

function configureLocalEndpoints(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '{}\n';
  let updated = upsertStringProperty(original, 'kodpauza.apiBaseUrl', 'http://localhost:4000');
  updated = upsertStringProperty(updated, 'kodpauza.dashboardUrl', 'http://localhost:3000');
  if (updated === original) {
    return;
  }

  const backupPath = `${filePath}.kodpauza-backup`;
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, original, { encoding: 'utf8', flag: 'wx' });
  }
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, updated, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function upsertStringProperty(source, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const property = new RegExp(`("${escapedKey}"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, 'g');
  const matches = [...source.matchAll(property)];
  if (matches.length > 1) {
    fail(`В settings.json найдено несколько значений ${key}.`);
  }
  if (matches.length === 1) {
    return source.replace(property, `$1${JSON.stringify(value)}`);
  }

  const closingBrace = findRootClosingBrace(source);
  if (closingBrace < 0) {
    fail('Не удалось безопасно изменить settings.json: корневой объект не найден.');
  }
  const before = source.slice(0, closingBrace);
  const trailingWhitespace = before.match(/\s*$/)?.[0] || '';
  const body = before.slice(0, before.length - trailingWhitespace.length);
  const indent = [...source.matchAll(/(?:^|\n)([ \t]+)"[^"\n]+"\s*:/g)].at(-1)?.[1] || '  ';
  const last = body.trimEnd().at(-1);
  const comma = last && last !== '{' && last !== ',' ? ',' : '';
  return `${body}${comma}\n${indent}${JSON.stringify(key)}: ${JSON.stringify(value)},${trailingWhitespace}${source.slice(closingBrace)}`;
}

function findRootClosingBrace(source) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
    } else if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

function defaultCursorSettingsPath() {
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'settings.json',
    );
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) fail('Переменная APPDATA не задана.');
    return path.join(appData, 'Cursor', 'User', 'settings.json');
  }
  return path.join(os.homedir(), '.config', 'Cursor', 'User', 'settings.json');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
