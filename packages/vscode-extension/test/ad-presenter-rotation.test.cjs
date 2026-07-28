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
    dashboardUrl: 'https://kodpauza.ru',
    currentAd: async (surface) => {
      requests += 1;
      return {
        adId: `ad-${requests}`,
        campaignId: `campaign-${requests}`,
        text: `Объявление ${requests}`,
        url: 'https://example.com',
        erid: null,
        campaignName: 'KodPauza',
        advertiserName: 'ООО Тест',
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
  assert.equal(requests, 0);
  assert.equal(presenter.ad.campaignId, 'house');
  assert.equal(presenter.ad.trackable, false);
  assert.equal(presenter.ad.text, 'Реклама · Kodpauza · Зарабатывайте, пока AI работает');

  presenter.markPatchedUiVisibility(presenter.ad.adId, 'canary-view-1', true);
  await waitFor(() => presenter.ad?.adId === 'ad-1', 500);
  assert.equal(presenter.ad.adId, 'ad-1');
  assert.equal(presenter.ad.text, 'Реклама · ООО Тест · Объявление 1');
  assert.equal(requests, 6);

  presenter.markPatchedUiVisibility('ad-1', 'rotation-view-1', true);
  await waitFor(() => presenter.ad?.adId === 'ad-2', 500);
  assert.equal(requests, 7);
  assert.equal(presenter.sessionId, sessionId);

  presenter.markPatchedUiVisibility('ad-2', 'rotation-view-1', true);
  await waitFor(() => presenter.ad?.adId === 'ad-3', 500);
  assert.equal(requests, 8);
  assert.equal(presenter.sessionId, sessionId);

  presenter.stopWait();
  const requestsAfterStop = requests;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(requests, requestsAfterStop);
  assert.equal(presenter.sessionId, undefined);
  presenter.dispose();
});

test('не повторяет две последние кампании, если сервер может выдать альтернативу', async () => {
  const campaigns = ['alpha', 'alpha', 'beta', 'alpha', 'beta', 'gamma'];
  let requests = 0;
  const api = {
    dashboardUrl: 'https://kodpauza.ru',
    currentAd: async (surface) => {
      const campaignId = campaigns[requests] ?? 'gamma';
      requests += 1;
      return {
        adId: `${campaignId}-${requests}`,
        campaignId,
        text: campaignId,
        url: 'https://example.com',
        erid: null,
        campaignName: campaignId,
        advertiserName: campaignId,
        durationSec: 5,
        surface,
        trackable: true,
        format: 'standard',
      };
    },
  };
  const presenter = new StatusBarAdPresenter(
    api,
    { adsEnabled: true, integrationEnabled: true },
    { enqueue: async () => undefined },
    'test',
    'test.recent',
    false,
    25,
  );
  presenter.setPatchedUiEnabled(true);
  await presenter.startWait({
    surface: 'codex_vscode',
    toolName: 'codex_vscode',
    toolVersion: 'test',
    waitingLabel: 'Codex работает',
  });

  presenter.markPatchedUiVisibility(presenter.ad.adId, 'canary-view-2', true);
  await waitFor(() => presenter.ad?.campaignId === 'alpha', 500);
  presenter.markPatchedUiVisibility(presenter.ad.adId, 'recent-view-1', true);
  await waitFor(() => presenter.ad?.campaignId === 'beta', 500);
  presenter.markPatchedUiVisibility(presenter.ad.adId, 'recent-view-2', true);
  await waitFor(() => presenter.ad?.campaignId === 'gamma', 500);

  assert.ok(requests >= 6 && requests <= 30);
  presenter.dispose();
});

test('скрывает служебный house-оффер, когда платной кампании нет', async () => {
  let requests = 0;
  const api = {
    dashboardUrl: 'https://kodpauza.ru',
    currentAd: async () => {
      requests += 1;
      return undefined;
    },
  };
  const presenter = new StatusBarAdPresenter(
    api,
    { adsEnabled: true, integrationEnabled: true },
    { enqueue: async () => undefined },
    'test',
    'test.house',
    false,
    1_000,
  );
  presenter.setPatchedUiEnabled(true);
  await presenter.startWait({
    surface: 'codex_vscode',
    toolName: 'codex_vscode',
    toolVersion: 'test',
    waitingLabel: 'Codex работает',
  });

  presenter.markPatchedUiVisibility(presenter.ad.adId, 'canary-house-view', true);
  await waitFor(() => presenter.ad === undefined, 500);
  assert.equal(requests, 1);
  assert.equal(presenter.isVisible, false);
  assert.equal(presenter.isRunning, true);
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
