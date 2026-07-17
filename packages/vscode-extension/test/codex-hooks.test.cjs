const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  CodexHookInstaller,
  withInstalledHooks,
  withoutInstalledHooks
} = require('../dist/codexHookInstaller.js');

const sourceScript = path.resolve(__dirname, '../resources/codex-hook.cjs');

test('добавляет два lifecycle hook и сохраняет чужие обработчики', () => {
  const root = {
    custom: true,
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node existing-start.cjs' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'node existing-stop.cjs' }] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo check' }] }]
    }
  };

  const installed = withInstalledHooks(root, '/tmp/kodpauza-codex-lifecycle-hook.cjs');
  assert.equal(installed.custom, true);
  assert.equal(installed.hooks.UserPromptSubmit.length, 2);
  assert.equal(installed.hooks.Stop.length, 2);
  assert.deepEqual(installed.hooks.PreToolUse, root.hooks.PreToolUse);

  const removed = withoutInstalledHooks(installed);
  assert.deepEqual(removed, root);
});

test('на Windows основной command использует совместимое quoting', () => {
  const installed = withInstalledHooks(
    {},
    'C:\\Users\\Dev User\\.kodpauza\\kodpauza-codex-lifecycle-hook.cjs',
    'C:\\Program Files\\nodejs\\node.exe',
    'win32',
  );
  const start = installed.hooks.UserPromptSubmit[0].hooks[0];
  const stop = installed.hooks.Stop[0].hooks[0];

  assert.match(start.command, /^"C:\\Program Files\\nodejs\\node\.exe"/);
  assert.match(start.command, /"C:\\Users\\Dev User\\\.kodpauza\\kodpauza-codex-lifecycle-hook\.cjs" start$/);
  assert.equal(start.command, start.commandWindows);
  assert.match(stop.command, / stop$/);
  assert.doesNotMatch(start.command, /'/);
});

test('установка атомарна, повторяемая и удаляет только Kodpauza', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-hooks-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const codexHome = path.join(root, 'codex');
  const kodpauzaHome = path.join(root, 'kodpauza');
  await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'hooks.json'), JSON.stringify({
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'node keep-me.cjs' }] }]
    }
  }));

  const installer = new CodexHookInstaller(sourceScript, codexHome, kodpauzaHome);
  const first = await installer.install();
  assert.equal(first.installed, true);
  assert.equal(first.handlerCount, 2);
  assert.equal(first.changed, true);
  assert.ok(first.backupPath);

  const second = await installer.install();
  assert.equal(second.installed, true);
  assert.equal(second.handlerCount, 2);
  assert.equal(second.changed, false);

  const removal = await installer.remove();
  assert.equal(removal.installed, false);
  assert.equal(removal.handlerCount, 0);
  const saved = JSON.parse(await fs.readFile(path.join(codexHome, 'hooks.json'), 'utf8'));
  assert.equal(saved.hooks.Stop.length, 1);
  assert.equal(saved.hooks.Stop[0].hooks[0].command, 'node keep-me.cjs');
});

test('не перезаписывает поврежденный hooks.json', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-hooks-invalid-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const codexHome = path.join(root, 'codex');
  await fs.mkdir(codexHome, { recursive: true });
  const hooksPath = path.join(codexHome, 'hooks.json');
  await fs.writeFile(hooksPath, '{invalid');

  const installer = new CodexHookInstaller(sourceScript, codexHome, path.join(root, 'kodpauza'));
  await assert.rejects(() => installer.install(), /поврежден/);
  assert.equal(await fs.readFile(hooksPath, 'utf8'), '{invalid');
});
