const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  ClaudeHookInstaller,
  withInstalledClaudeHooks,
  withoutInstalledClaudeHooks
} = require('../dist/claudeHookInstaller.js');

const sourceScript = path.resolve(__dirname, '../resources/codex-hook.cjs');

test('Claude hooks сохраняют чужие настройки и обработчики', () => {
  const root = {
    model: 'sonnet',
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: '/usr/bin/existing-start' }] }],
      Stop: [{ hooks: [{ type: 'command', command: '/usr/bin/existing-stop' }] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo check' }] }]
    }
  };

  const installed = withInstalledClaudeHooks(
    root,
    '/tmp/kodpauza-claude-lifecycle-hook.cjs',
    '/usr/bin/node'
  );
  assert.equal(installed.model, 'sonnet');
  assert.equal(installed.hooks.UserPromptSubmit.length, 2);
  assert.equal(installed.hooks.Stop.length, 2);
  assert.deepEqual(installed.hooks.PreToolUse, root.hooks.PreToolUse);
  const ownHandler = installed.hooks.UserPromptSubmit[1].hooks[0];
  assert.equal(ownHandler.command, '/usr/bin/node');
  assert.deepEqual(ownHandler.args, [
    '/tmp/kodpauza-claude-lifecycle-hook.cjs',
    'claude',
    'start'
  ]);

  assert.deepEqual(withoutInstalledClaudeHooks(installed), root);
});

test('Claude hooks устанавливаются повторяемо и удаляют только Kodpauza', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-claude-hooks-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const claudeHome = path.join(root, 'claude');
  const kodpauzaHome = path.join(root, 'kodpauza');
  await fs.mkdir(claudeHome, { recursive: true });
  await fs.writeFile(path.join(claudeHome, 'settings.json'), JSON.stringify({
    theme: 'dark',
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'keep-me' }] }]
    }
  }));

  const installer = new ClaudeHookInstaller(sourceScript, claudeHome, kodpauzaHome);
  const first = await installer.install();
  assert.equal(first.installed, true);
  assert.equal(first.handlerCount, 2);
  assert.equal(first.changed, true);
  assert.ok(first.backupPath);
  assert.equal((await fs.stat(installer.scriptPath)).mode & 0o777, 0o700);

  const second = await installer.install();
  assert.equal(second.installed, true);
  assert.equal(second.changed, false);

  const removed = await installer.remove();
  assert.equal(removed.installed, false);
  const saved = JSON.parse(await fs.readFile(path.join(claudeHome, 'settings.json'), 'utf8'));
  assert.equal(saved.theme, 'dark');
  assert.equal(saved.hooks.Stop.length, 1);
  assert.equal(saved.hooks.Stop[0].hooks[0].command, 'keep-me');
});

test('Claude hooks не перезаписывают поврежденный settings.json', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-claude-hooks-invalid-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const claudeHome = path.join(root, 'claude');
  await fs.mkdir(claudeHome, { recursive: true });
  const settingsPath = path.join(claudeHome, 'settings.json');
  await fs.writeFile(settingsPath, '{invalid');

  const installer = new ClaudeHookInstaller(sourceScript, claudeHome, path.join(root, 'kodpauza'));
  await assert.rejects(() => installer.install(), /поврежден/);
  assert.equal(await fs.readFile(settingsPath, 'utf8'), '{invalid');
});
