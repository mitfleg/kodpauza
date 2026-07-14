const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {
  CODEX_26_707_PATCH_PROFILE,
  CODEX_26_707_SHIMMER_PATCH_PROFILE,
  CodexPatchInstaller,
  patchHostSource,
  patchThinkingShimmerSource,
  patchWebviewSource
} = require('../dist/codexPatchInstaller.js');

const thinking = '(0,Y.jsx)(K,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
const reasoning = '(0,Y.jsx)(K,{id:`reasoningItem.thinking`,defaultMessage:`Thinking`,description:`Message shown when AI is currently thinking`})';
const exploring = '(0,Y.jsx)(K,{id:`localConversationTurn.exploration.accordion.header.active`,defaultMessage:`Exploring`,description:`Header for the exploration accordion while Codex is listing or reading files`,children:Dd})';

function fixtureWebview() {
  return `var X=e(r()),Po=${[thinking, thinking, thinking, thinking, reasoning, exploring].join(';')}`;
}

function fixtureHost() {
  return 'prefix;let n=[t,r,...b8e,...v8e];suffix';
}

function modernFixtureWebview() {
  const thinkingModern = '(0,Q.jsx)(Y,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  const reasoningModern = '(0,Q.jsx)(Y,{id:`reasoningItem.thinking`,defaultMessage:`Thinking`,description:`Message shown when AI is currently thinking`})';
  const exploringModern = '(0,Q.jsx)(Y,{id:`localConversationTurn.exploration.accordion.header.active`,defaultMessage:`Exploring`,description:`Header for the exploration accordion while Codex is listing or reading files`,children:Of})';
  const placeholderModern = '(0,Q.jsx)(Y,{...Gm.thinking})';
  return `var Z=i(),Q=n();var $=e(t(),1),Ua=${[
    thinkingModern,
    thinkingModern,
    thinkingModern,
    thinkingModern,
    thinkingModern,
    reasoningModern,
    exploringModern,
    placeholderModern,
    placeholderModern,
    placeholderModern
  ].join(';')}`;
}

function modernFixtureHost() {
  return 'prefix;let n=[t,r,...jYe,...HYe];suffix';
}

function modernFixtureShimmer() {
  const fallback = '(0,f.jsx)(i,{id:`thinkingShimmer.default`,defaultMessage:`Thinking`,description:`Default placeholder shown while the assistant is thinking`})';
  return `var c=e(t(),1),l={};function y(r){return r??${fallback}}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('патч заменяет активные ожидания, сохраняет резервную копию и откатывается', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(extensionPath, 'webview', 'assets', 'local-conversation-turn-test.js');
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);

  const installer = new CodexPatchInstaller(extensionPath, 'test-version', home, {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource)
  });

  const installed = await installer.install();
  assert.equal(installed.installed, true);
  assert.equal(installed.changed, true);
  assert.equal(installed.compatibilityMode, 'exact');
  assert.match(installed.token, /^[a-f0-9]{64}$/);
  assert.match(await fs.readFile(hostPath, 'utf8'), /__KODPAUZA_CSP_START__/);
  const patchedWebview = await fs.readFile(webviewPath, 'utf8');
  assert.match(patchedWebview, /__KODPAUZA_UI_START__/);
  assert.match(patchedWebview, /__kpObserveVisibility/);
  assert.match(patchedWebview, /document\.visibilityState!=="visible"/);
  assert.match(patchedWebview, /elementFromPoint/);
  assert.match(patchedWebview, /\/visibility\?token=/);
  assert.match(patchedWebview, /e\.format==="premium"/);
  assert.doesNotMatch(patchedWebview, /children:"Премиум"/);
  assert.equal((patchedWebview.match(/__kpAdMessage/g) ?? []).length, 7);
  assert.doesNotThrow(() => new vm.Script(patchedWebview));

  const repeated = await installer.install();
  assert.equal(repeated.changed, false);
  assert.equal(repeated.token, installed.token);

  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), webviewSource);
});

test('патч принимает новую версию Codex при неизменной структуре цели', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(extensionPath, 'webview', 'assets', 'local-conversation-turn-test.js');
  const hostSource = fixtureHost();
  const webviewSource = `${fixtureWebview()};var unrelated=1`;
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);

  const installer = new CodexPatchInstaller(extensionPath, 'future-version', home);

  const installed = await installer.install();
  assert.equal(installed.installed, true);
  assert.equal(installed.compatibilityMode, 'structural');
  assert.match(await fs.readFile(webviewPath, 'utf8'), /__KODPAUZA_UI_START__/);
});

test('патч Codex fail-closed отклоняет измененную цель', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(extensionPath, 'webview', 'assets', 'local-conversation-turn-test.js');
  const hostSource = fixtureHost();
  const changed = fixtureWebview().replace('reasoningItem.thinking', 'reasoningItem.changed');
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, changed);

  const installer = new CodexPatchInstaller(extensionPath, 'future-version', home);
  const status = await installer.inspect();
  assert.equal(status.compatible, false);
  assert.equal(status.compatibilityMode, 'unsupported');
  await assert.rejects(() => installer.install(), /безопасно отключена/);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), changed);
});

test('чистые функции патча отклоняют повторное применение', () => {
  const token = 'b'.repeat(64);
  const webview = patchWebviewSource(fixtureWebview(), token);
  const host = patchHostSource(fixtureHost());
  const shimmer = patchThinkingShimmerSource(
    modernFixtureShimmer(),
    token,
    CODEX_26_707_SHIMMER_PATCH_PROFILE
  );
  assert.throws(() => patchWebviewSource(webview, token), /уже присутствует/);
  assert.throws(() => patchHostSource(host), /уже присутствует/);
  assert.throws(
    () => patchThinkingShimmerSource(shimmer, token, CODEX_26_707_SHIMMER_PATCH_PROFILE),
    /уже присутствует/
  );
});

test('профиль Codex 26.707 патчит новую структуру без затрагивания других строк', () => {
  const token = 'c'.repeat(64);
  const source = modernFixtureWebview();
  const webview = patchWebviewSource(source, token, CODEX_26_707_PATCH_PROFILE);
  const host = patchHostSource(modernFixtureHost(), CODEX_26_707_PATCH_PROFILE);

  assert.match(webview, /__KODPAUZA_UI_START__/);
  assert.match(webview, /\$\.useSyncExternalStore/);
  assert.match(webview, /Q\.jsxs/);
  assert.equal((webview.match(/__kpAdMessage/g) ?? []).length, 11);
  assert.match(
    webview,
    /__kpAdMessage,\{fallback:\(0,Q\.jsx\)\(Y,\{\.\.\.Gm\.thinking\}\)\}/
  );
  assert.match(host, /__KODPAUZA_CSP_START__/);
  assert.doesNotThrow(() => new vm.Script(webview));
});

test('профиль Codex 26.707 патчит и восстанавливает отдельный модуль видимого Thinking', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const assetsPath = path.join(extensionPath, 'webview', 'assets');
  const webviewPath = path.join(assetsPath, 'local-conversation-turn-modern.js');
  const shimmerPath = path.join(assetsPath, 'thinking-shimmer-modern.js');
  const hostSource = modernFixtureHost();
  const webviewSource = modernFixtureWebview();
  const shimmerSource = modernFixtureShimmer();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(assetsPath, { recursive: true });
  await Promise.all([
    fs.writeFile(hostPath, hostSource),
    fs.writeFile(webviewPath, webviewSource),
    fs.writeFile(shimmerPath, shimmerSource)
  ]);

  const installer = new CodexPatchInstaller(extensionPath, 'modern-version', home, {
    version: 'modern-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource),
    patchProfile: CODEX_26_707_PATCH_PROFILE,
    shimmerSha256: sha256(shimmerSource),
    shimmerPatchProfile: CODEX_26_707_SHIMMER_PATCH_PROFILE
  });

  const installed = await installer.install();
  const [patchedWebview, patchedShimmer, manifest] = await Promise.all([
    fs.readFile(webviewPath, 'utf8'),
    fs.readFile(shimmerPath, 'utf8'),
    fs.readFile(path.join(home, 'codex-ui-patch.json'), 'utf8').then(JSON.parse)
  ]);
  assert.equal(installed.installed, true);
  assert.equal(installed.shimmerPath, shimmerPath);
  assert.equal(manifest.files.length, 3);
  assert.equal(patchedWebview.includes(installed.token), true);
  assert.equal(patchedShimmer.includes(installed.token), true);
  assert.match(patchedShimmer, /__kpAdMessage/);
  assert.doesNotThrow(() => new vm.Script(patchedShimmer));
  assert.equal((await installer.inspect()).installed, true);

  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), webviewSource);
  assert.equal(await fs.readFile(shimmerPath, 'utf8'), shimmerSource);
});

test('восстановление исправляет частично примененный патч', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(extensionPath, 'webview', 'assets', 'local-conversation-turn-test.js');
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);

  const installer = new CodexPatchInstaller(extensionPath, 'test-version', home, {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource)
  });
  await installer.install();
  await fs.writeFile(hostPath, hostSource);

  await assert.rejects(() => installer.inspect(), /применен частично/);
  const restored = await installer.restore();
  assert.equal(restored.changed, true);
  assert.equal(await fs.readFile(hostPath, 'utf8'), hostSource);
  assert.equal(await fs.readFile(webviewPath, 'utf8'), webviewSource);
});

test('автоматическая проверка переустанавливает частично примененный патч', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(extensionPath, 'webview', 'assets', 'local-conversation-turn-test.js');
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);

  const installer = new CodexPatchInstaller(extensionPath, 'test-version', home, {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource)
  });
  const first = await installer.install();
  await fs.writeFile(hostPath, hostSource);

  const repaired = await installer.ensureInstalled();
  assert.equal(repaired.installed, true);
  assert.equal(repaired.changed, true);
  assert.notEqual(repaired.token, first.token);
  assert.match(await fs.readFile(hostPath, 'utf8'), /__KODPAUZA_CSP_START__/);
  assert.match(await fs.readFile(webviewPath, 'utf8'), /__KODPAUZA_UI_START__/);
});

test('автоматическая проверка обновляет старую ревизию патча Codex', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = path.join(root, 'codex');
  const home = path.join(root, 'kodpauza');
  const hostPath = path.join(extensionPath, 'out', 'extension.js');
  const webviewPath = path.join(extensionPath, 'webview', 'assets', 'local-conversation-turn-test.js');
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();
  await fs.mkdir(path.dirname(hostPath), { recursive: true });
  await fs.mkdir(path.dirname(webviewPath), { recursive: true });
  await fs.writeFile(hostPath, hostSource);
  await fs.writeFile(webviewPath, webviewSource);
  const build = {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource)
  };
  const installer = new CodexPatchInstaller(extensionPath, 'test-version', home, build);
  const first = await installer.install();
  const manifestPath = path.join(home, 'codex-ui-patch.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.patchRevision = 1;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

  const updated = await installer.ensureInstalled();
  assert.equal(updated.installed, true);
  assert.equal(updated.changed, true);
  assert.notEqual(updated.token, first.token);
  assert.equal(JSON.parse(await fs.readFile(manifestPath, 'utf8')).patchRevision, 4);
});

test('автоматическая проверка переносит патч на новый каталог Codex', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-patch-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'kodpauza');
  const oldExtensionPath = path.join(root, 'codex-old');
  const newExtensionPath = path.join(root, 'codex-new');
  const hostSource = fixtureHost();
  const webviewSource = fixtureWebview();

  for (const extensionPath of [oldExtensionPath, newExtensionPath]) {
    const hostPath = path.join(extensionPath, 'out', 'extension.js');
    const webviewPath = path.join(extensionPath, 'webview', 'assets', 'local-conversation-turn-test.js');
    await fs.mkdir(path.dirname(hostPath), { recursive: true });
    await fs.mkdir(path.dirname(webviewPath), { recursive: true });
    await fs.writeFile(hostPath, hostSource);
    await fs.writeFile(webviewPath, webviewSource);
  }

  const build = {
    version: 'test-version',
    hostSha256: sha256(hostSource),
    webviewSha256: sha256(webviewSource)
  };
  await new CodexPatchInstaller(oldExtensionPath, 'test-version', home, build).install();

  const migrated = await new CodexPatchInstaller(newExtensionPath, 'test-version', home, build).ensureInstalled();
  assert.equal(migrated.installed, true);
  assert.equal(migrated.changed, true);
  assert.equal(await fs.readFile(path.join(oldExtensionPath, 'out', 'extension.js'), 'utf8'), hostSource);
  assert.equal(
    await fs.readFile(path.join(oldExtensionPath, 'webview', 'assets', 'local-conversation-turn-test.js'), 'utf8'),
    webviewSource
  );
  assert.match(await fs.readFile(path.join(newExtensionPath, 'out', 'extension.js'), 'utf8'), /__KODPAUZA_CSP_START__/);
  const manifest = JSON.parse(await fs.readFile(path.join(home, 'codex-ui-patch.json'), 'utf8'));
  assert.equal(manifest.extensionPath, newExtensionPath);
});
