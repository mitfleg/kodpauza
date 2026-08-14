const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const configurationValues = new Map();
const fakeConfiguration = {
  get: (key, fallback) => (configurationValues.has(key) ? configurationValues.get(key) : fallback),
  inspect: (key) => ({ globalValue: configurationValues.get(key) }),
  update: async (key, value) => {
    if (value === undefined) configurationValues.delete(key);
    else configurationValues.set(key, value);
  },
};
const fakeVscode = {
  ConfigurationTarget: { Global: 1 },
  workspace: { getConfiguration: () => fakeConfiguration },
};

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') return fakeVscode;
  return originalLoad.call(this, request, parent, isMain);
};
const { KodpauzaState } = require('../dist/state.js');
Module._load = originalLoad;

function context(initialSecrets = {}, initialGlobalState = {}) {
  const secrets = new Map(Object.entries(initialSecrets));
  const globalState = new Map(Object.entries(initialGlobalState));
  return {
    value: {
      secrets: {
        get: async (key) => secrets.get(key),
        store: async (key, value) => secrets.set(key, value),
        delete: async (key) => secrets.delete(key),
      },
      globalState: {
        get: (key, fallback) => (globalState.has(key) ? globalState.get(key) : fallback),
        update: async (key, value) => {
          if (value === undefined) globalState.delete(key);
          else globalState.set(key, value);
        },
      },
    },
    secrets,
    globalState,
  };
}

test.beforeEach(() => configurationValues.clear());

test('не требует вход при первом запуске без сохранённой сессии', async () => {
  const fixture = context();
  const state = new KodpauzaState(fixture.value);

  await state.initialize();

  assert.equal(state.authSessionStatus, 'signed_out');
  assert.equal(state.requiresReauthentication, false);
});

test('после обновления распознаёт сброшенную сессию при включённой рекламе', async () => {
  configurationValues.set('adsEnabled', true);
  const fixture = context();
  const state = new KodpauzaState(fixture.value);

  await state.initialize();

  assert.equal(state.authSessionStatus, 'reauthentication_required');
  assert.equal(state.requiresReauthentication, true);
});

test('после обновления принимает полную сохранённую сессию без повторного входа', async () => {
  const fixture = context({
    'kodpauza.accessToken': 'access',
    'kodpauza.refreshToken': 'refresh',
    'kodpauza.eventSecret': 'secret',
  });
  const state = new KodpauzaState(fixture.value);

  await state.initialize();

  assert.equal(state.authSessionStatus, 'authenticated');
  assert.equal(state.requiresReauthentication, false);
});

test('истёкшая сессия требует повторного входа и сохраняет это после перезапуска', async () => {
  const fixture = context();
  const state = new KodpauzaState(fixture.value);
  await state.initialize();
  await state.setAuthSession('access', 'refresh', 'secret');

  await state.invalidateAuthSession();

  assert.equal(state.requiresReauthentication, true);
  assert.equal(fixture.secrets.size, 0);
  const restarted = new KodpauzaState(fixture.value);
  await restarted.initialize();
  assert.equal(restarted.requiresReauthentication, true);
});

test('успешный вход снимает предупреждение, а явный выход не возвращает его', async () => {
  configurationValues.set('adsEnabled', true);
  const fixture = context();
  const state = new KodpauzaState(fixture.value);
  await state.initialize();
  assert.equal(state.requiresReauthentication, true);

  await state.setAuthSession('access', 'refresh', 'secret');
  assert.equal(state.authSessionStatus, 'authenticated');
  assert.equal(state.requiresReauthentication, false);

  await state.clearAuthSession();
  const restarted = new KodpauzaState(fixture.value);
  await restarted.initialize();
  assert.equal(restarted.authSessionStatus, 'signed_out');
  assert.equal(restarted.requiresReauthentication, false);
  assert.equal(fixture.secrets.size, 0);
});
