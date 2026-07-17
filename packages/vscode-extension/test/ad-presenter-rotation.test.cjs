const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const disposables = [];
const statusItem = {
  text: '',
  tooltip: '',
  command: undefined,
  name: '',
  show() {},
  hide() {},
  dispose() {},
};
const fakeVscode = {
  StatusBarAlignment: { Right: 2 },
  Disposable: {
    from: (...items) => ({ dispose: () => items.forEach((item) => item.dispose()) }),
  },
  window: {
    state: { focused: true },
    createStatusBarItem: () => statusItem,
    onDidChangeWindowState: (callback) => {
      disposables.push(callback);
      return { dispose() {} };
    },
  },
  workspace: {
    getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
};

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return fakeVscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { StatusBarAdPresenter } = require('../dist/adPresenter.js');
Module._load = originalLoad;

test('в одной активной сессии запрашивает новое объявление каждые 30 секунд показа', async () => {
  let requests = 0;
  const api = {
    currentAd: async (surface) => {
      requests += 1;
      return {
        adId: `ad-${requests}`,
        campaignId: `campaign-${requests}`,
        text: `Объявление ${requests}`,
        url: 'https://example.com',
        erid: null,
        advertiserName: 'Тест',
        durationSec: 5,
        surface,
        trackable: true,
        format: 'standard',
      };
    },
  };
  const state = { adsEnabled: true, integrationEnabled: true };
  const outbox = { enqueue: async () => undefined };
  const presenter = new StatusBarAdPresenter(api, state, outbox, 'test', 'test.ad', false, 25);
  presenter.setPatchedUiEnabled(true);

  await presenter.startWait({
    surface: 'codex_vscode',
    toolName: 'codex_vscode',
    toolVersion: 'test',
    waitingLabel: 'Codex работает',
  });
  const sessionId = presenter.sessionId;
  assert.match(sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(presenter.ad.adId, 'ad-1');

  presenter.markPatchedUiVisibility('ad-1', 'rotation-view-1', true);
  await waitFor(() => presenter.ad?.adId === 'ad-2', 500);
  assert.equal(presenter.sessionId, sessionId);

  presenter.markPatchedUiVisibility('ad-2', 'rotation-view-1', true);
  await waitFor(() => presenter.ad?.adId === 'ad-3', 500);
  assert.equal(presenter.sessionId, sessionId);

  presenter.stopWait();
  const requestsAfterStop = requests;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(requests, requestsAfterStop);
  assert.equal(presenter.sessionId, undefined);
  presenter.dispose();
});

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Объявление не сменилось вовремя.');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
