const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CodexHookBridge } = require('../dist/codexBridge.js');

test('bridge принимает только подписанные локальные lifecycle события', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-bridge-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const events = [];
  const clicks = [];
  const visible = [];
  let uiEnabled = true;
  const uiToken = 'a'.repeat(64);
  const claudeUiToken = 'b'.repeat(64);
  const bridge = new CodexHookBridge(
    root,
    () => ['/workspace/project'],
    async (event, tool) => {
      events.push({ event, tool });
    },
    {
      uiEnabled: () => uiEnabled,
      uiToken: () => uiToken,
      currentAd: () => ({
        active: true,
        adId: 'ad-1',
        text: 'Тестовое объявление',
        format: 'standard',
      }),
      onAdClick: async (adId) => {
        clicks.push(adId);
      },
      uiAdapters: {
        claude: {
          token: () => claudeUiToken,
          currentAd: () => ({
            active: true,
            adId: 'ad-claude',
            text: 'Claude объявление',
            format: 'premium',
          }),
          onAdClick: async (adId) => clicks.push(adId),
          onVisibility: (event) => visible.push(event),
        },
      },
    },
  );
  context.after(() => bridge.stop());

  await bridge.start();
  const names = await fs.readdir(path.join(root, 'bridges'));
  assert.equal(names.length, 1);
  const descriptorPath = path.join(root, 'bridges', names[0]);
  const descriptor = JSON.parse(await fs.readFile(descriptorPath, 'utf8'));
  const url = `http://127.0.0.1:${descriptor.port}/v1/codex/lifecycle`;

  const unauthorized = await fetch(url, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, event: 'start', cwd: '/workspace/project' }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(events.length, 0);

  const accepted = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, event: 'start', cwd: '/workspace/project' }),
  });
  assert.equal(accepted.status, 204);
  assert.deepEqual(events, [
    {
      event: { version: 1, event: 'start', cwd: '/workspace/project' },
      tool: 'codex',
    },
  ]);

  const hiddenAd = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/codex/ad/current?token=wrong`,
  );
  assert.equal(hiddenAd.status, 401);

  const currentAd = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/codex/ad/current?token=${uiToken}`,
  );
  assert.equal(currentAd.status, 200);
  assert.equal(currentAd.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await currentAd.json(), {
    active: true,
    adId: 'ad-1',
    text: 'Тестовое объявление',
    format: 'standard',
  });

  const clicked = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/codex/ad/click?token=${uiToken}`,
    {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'ad-1',
    },
  );
  assert.equal(clicked.status, 204);
  assert.deepEqual(clicks, ['ad-1']);

  const claudeLifecycle = await fetch(`http://127.0.0.1:${descriptor.port}/v1/claude/lifecycle`, {
    method: 'POST',
    headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, event: 'start', cwd: '/workspace/project' }),
  });
  assert.equal(claudeLifecycle.status, 204);
  assert.equal(events[1].tool, 'claude');

  const claudeAd = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/claude/ad/current?token=${claudeUiToken}`,
  );
  assert.equal(claudeAd.status, 200);
  assert.deepEqual(await claudeAd.json(), {
    active: true,
    adId: 'ad-claude',
    text: 'Claude объявление',
    format: 'premium',
  });
  assert.deepEqual(visible, []);

  const wrongVisibility = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/claude/ad/visibility?token=${claudeUiToken}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ adId: 'another-ad', viewId: 'view-test-1', visible: true }),
    },
  );
  assert.equal(wrongVisibility.status, 409);
  assert.deepEqual(visible, []);

  const confirmedVisibility = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/claude/ad/visibility?token=${claudeUiToken}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ adId: 'ad-claude', viewId: 'view-test-1', visible: true }),
    },
  );
  assert.equal(confirmedVisibility.status, 204);
  assert.deepEqual(visible, [{ adId: 'ad-claude', viewId: 'view-test-1', visible: true }]);

  const hiddenVisibility = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/claude/ad/visibility?token=${claudeUiToken}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ adId: 'ad-claude', viewId: 'view-test-1', visible: false }),
    },
  );
  assert.equal(hiddenVisibility.status, 204);
  assert.equal(visible[1].visible, false);

  uiEnabled = false;
  const inactiveAd = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/claude/ad/current?token=${claudeUiToken}`,
  );
  assert.equal(inactiveAd.status, 200);
  assert.deepEqual(await inactiveAd.json(), { active: false });

  const inactiveVisibility = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/claude/ad/visibility?token=${claudeUiToken}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ adId: 'ad-claude', viewId: 'view-test-1', visible: true }),
    },
  );
  assert.equal(inactiveVisibility.status, 409);
  assert.equal(visible.length, 2);

  const inactiveClick = await fetch(
    `http://127.0.0.1:${descriptor.port}/v1/claude/ad/click?token=${claudeUiToken}`,
    { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'ad-claude' },
  );
  assert.equal(inactiveClick.status, 409);
  assert.deepEqual(clicks, ['ad-1']);

  await bridge.stop();
  await assert.rejects(() => fs.access(descriptorPath));
});

test('bridge не роняет второе окно и занимает UI-порт после его освобождения', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kodpauza-bridge-port-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const owner = new CodexHookBridge(
    root,
    () => ['/workspace/first'],
    async () => undefined,
    {
      uiPort: 0,
    },
  );
  context.after(() => owner.stop());
  await owner.start();

  const ownerDescriptors = await fs.readdir(path.join(root, 'bridges'));
  assert.equal(ownerDescriptors.length, 1);
  const ownerDescriptor = JSON.parse(
    await fs.readFile(path.join(root, 'bridges', ownerDescriptors[0]), 'utf8'),
  );

  const bridge = new CodexHookBridge(
    root,
    () => ['/workspace/project'],
    async () => undefined,
    {
      uiPort: ownerDescriptor.port,
      portRetryMs: 20,
    },
  );
  context.after(() => bridge.stop());

  await bridge.start();
  assert.equal(bridge.isListening, false);
  assert.match(bridge.lastError, /другим окном Cursor/);

  await owner.stop();
  await waitFor(() => bridge.isListening, 1_000);
  assert.equal(bridge.lastError, undefined);

  const descriptors = await fs.readdir(path.join(root, 'bridges'));
  assert.equal(descriptors.length, 1);
});

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Условие не выполнено вовремя.');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
