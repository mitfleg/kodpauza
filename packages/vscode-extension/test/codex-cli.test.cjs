const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { findBundledCodexCli } = require('../dist/codexCli.js');

test('находит встроенный codex.exe в Windows-сборке расширения', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-codex-cli-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const executable = path.join(root, 'bin', 'windows-x86_64', 'codex.exe');
  await fs.mkdir(path.dirname(executable), { recursive: true });
  await fs.writeFile(executable, '');

  assert.equal(await findBundledCodexCli(root, 'win32'), executable);
});

test('предпочитает бинарник текущей платформы', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-codex-cli-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const macos = path.join(root, 'bin', 'macos-aarch64', 'codex');
  const linux = path.join(root, 'bin', 'linux-x86_64', 'codex');
  await fs.mkdir(path.dirname(macos), { recursive: true });
  await fs.mkdir(path.dirname(linux), { recursive: true });
  await Promise.all([fs.writeFile(macos, ''), fs.writeFile(linux, '')]);

  assert.equal(await findBundledCodexCli(root, 'darwin'), macos);
});

test('возвращает undefined, если встроенного CLI нет', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-codex-cli-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  assert.equal(await findBundledCodexCli(root, 'win32'), undefined);
});
