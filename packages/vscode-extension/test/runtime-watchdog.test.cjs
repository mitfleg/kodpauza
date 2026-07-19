const test = require('node:test');
const assert = require('node:assert/strict');
const { runtimeReloadDecision } = require('../dist/runtimeWatchdog.js');

test('не перезагружает редактор посреди активного ответа AI', () => {
  assert.deepEqual(
    runtimeReloadDecision({
      patchChanged: true,
      activeTurnMissingUi: true,
      anyTurnActive: true,
      reloadPending: false,
    }),
    { reloadNow: false, reloadPending: true },
  );
});

test('перезагружает редактор после завершения активного ответа', () => {
  assert.deepEqual(
    runtimeReloadDecision({
      patchChanged: false,
      activeTurnMissingUi: false,
      anyTurnActive: false,
      reloadPending: true,
    }),
    { reloadNow: true, reloadPending: false },
  );
});

test('не перезагружает редактор без признаков рассинхронизации', () => {
  assert.deepEqual(
    runtimeReloadDecision({
      patchChanged: false,
      activeTurnMissingUi: false,
      anyTurnActive: false,
      reloadPending: false,
    }),
    { reloadNow: false, reloadPending: false },
  );
});
