'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const installerPath = path.join(repositoryRoot, 'apps/web/public/install.sh');
const powershellPath = path.join(repositoryRoot, 'apps/web/public/install.ps1');
const extensionPackage = require('../packages/vscode-extension/package.json');
const extensionId = `${extensionPackage.publisher}.${extensionPackage.name}`;
const vsix = Buffer.from('kodpauza-installer-fixture-v1');
const checksum = crypto.createHash('sha256').update(vsix).digest('hex');
const newerStoreVersion = extensionPackage.version
  .split('.')
  .map(Number)
  .map((part, index) => (index === 2 ? part + 1 : part))
  .join('.');

async function main() {
  await staticChecks();
  await runScenario(
    { name: 'store-current', storeVersion: extensionPackage.version },
    async ({ result, requests, root }) => {
      assert.equal(result.code, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /автообновления включены/);
      assert.deepEqual(requests, ['/downloads/kodpauza-version.txt']);
      await assert.rejects(fs.access(path.join(root, '.kodpauza/install-sources/vscode.vsix')));
    },
  );
  await runScenario(
    { name: 'store-newer', storeVersion: newerStoreVersion },
    async ({ result, requests, root }) => {
      assert.equal(result.code, 0, result.stderr || result.stdout);
      assert.match(result.stdout, new RegExp(`Kodpauza ${newerStoreVersion.replaceAll('.', '\\.')}`));
      assert.deepEqual(requests, ['/downloads/kodpauza-version.txt']);
      await assert.rejects(fs.access(path.join(root, '.kodpauza/install-sources/vscode.vsix')));
    },
  );
  await runScenario(
    { name: 'store-stale', storeVersion: '0.0.1' },
    async ({ result, requests, root }) => {
      assert.equal(result.code, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /в магазине пока версия 0\.0\.1/);
      assert.match(result.stdout, /Целостность VSIX подтверждена/);
      assert.match(result.stdout, /установлена из резервного пакета/);
      assert.match(result.stdout, /проверка подписанных обновлений включена/);
      assert.deepEqual(requests, [
        '/downloads/kodpauza-version.txt',
        '/downloads/kodpauza.vsix',
        '/downloads/kodpauza-vsix.sha256',
      ]);
      assert.equal(
        (
          await fs.readFile(path.join(root, '.kodpauza/install-sources/vscode.vsix'), 'utf8')
        ).trim(),
        'vsix',
      );
      assert.deepEqual(
        await fs.readFile(
          path.join(root, `.kodpauza/update-cache/kodpauza-${extensionPackage.version}.vsix`),
        ),
        vsix,
      );
    },
  );
  await runScenario(
    { name: 'checksum-mismatch', storeVersion: '0.0.1', servedChecksum: '0'.repeat(64) },
    ({ result }) => {
      assert.equal(result.code, 1);
      assert.match(`${result.stdout}\n${result.stderr}`, /Контрольная сумма VSIX не совпала/);
    },
  );
  await runScenario({ name: 'dry-run', args: ['--dry-run'] }, ({ result, requests }) => {
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /расширение было бы установлено или обновлено/);
    assert.deepEqual(requests, []);
  });
  process.stdout.write('One-command installer tests passed.\n');
}

async function staticChecks() {
  const [shell, powershell] = await Promise.all([
    fs.readFile(installerPath, 'utf8'),
    fs.readFile(powershellPath, 'utf8'),
  ]);
  for (const source of [shell, powershell]) {
    assert.match(source, new RegExp(extensionId.replace('.', '\\.')));
    assert.match(source, /kodpauza-vsix\.sha256/);
    assert.doesNotMatch(source, /sudo|RunAs|state\.vscdb|workspaceStorage|\.git\//i);
  }
  assert.match(shell, /--editor all\|vscode\|cursor\|vscodium/);
  assert.match(powershell, /Microsoft VS Code/);
  assert.match(powershell, /Programs\\Cursor/);
}

async function runScenario(options, verify) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `kodpauza-installer-${options.name}-`));
  const bin = path.join(root, 'bin');
  const state = path.join(root, 'state');
  const requests = [];
  await fs.mkdir(bin);
  const fakeEditor = path.join(bin, 'code');
  await fs.writeFile(
    fakeEditor,
    `#!/bin/sh
case "$1" in
  --install-extension)
    if [ "$2" = "${extensionId}" ]; then
      printf '%s' "$KODPAUZA_TEST_STORE_VERSION" > "$KODPAUZA_TEST_STATE"
    else
      printf '%s' "$KODPAUZA_TEST_EXPECTED_VERSION" > "$KODPAUZA_TEST_STATE"
    fi
    exit 0
    ;;
  --list-extensions)
    if [ -s "$KODPAUZA_TEST_STATE" ]; then
      printf '${extensionId}@%s\\n' "$(cat "$KODPAUZA_TEST_STATE")"
    fi
    exit 0
    ;;
esac
exit 2
`,
    { mode: 0o700 },
  );

  const server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url === '/downloads/kodpauza-version.txt') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(`${extensionPackage.version}\n`);
    } else if (request.url === '/downloads/kodpauza-vsix.sha256') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(`${options.servedChecksum ?? checksum}  kodpauza.vsix\n`);
    } else if (request.url === '/downloads/kodpauza.vsix') {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      response.end(vsix);
    } else {
      response.writeHead(404);
      response.end();
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const result = await spawn(installerPath, ['--editor', 'vscode', ...(options.args ?? [])], {
      env: {
        ...process.env,
        PATH: `${bin}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
        HOME: root,
        KODPAUZA_BASE_URL: `http://127.0.0.1:${address.port}`,
        KODPAUZA_TEST_STATE: state,
        KODPAUZA_TEST_STORE_VERSION: options.storeVersion ?? extensionPackage.version,
        KODPAUZA_TEST_EXPECTED_VERSION: extensionPackage.version,
      },
    });
    await verify({ result, requests, root });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
}

function spawn(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
