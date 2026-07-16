const test = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldAutomaticallyConnectIntegrations,
} = require('../dist/integrationAutoConnect.js');

test('после входа подключает интеграции независимо от старого runtime-флага', () => {
  assert.equal(shouldAutomaticallyConnectIntegrations({
    trigger: 'login',
    authenticated: true,
    autoConnectEnabled: true,
    integrationEnabled: false,
  }), true);
  assert.equal(shouldAutomaticallyConnectIntegrations({
    trigger: 'login',
    authenticated: true,
    autoConnectEnabled: true,
    integrationEnabled: true,
  }), true);
});

test('при запуске восстанавливает только отсутствующую разрешенную интеграцию', () => {
  assert.equal(shouldAutomaticallyConnectIntegrations({
    trigger: 'startup',
    authenticated: true,
    autoConnectEnabled: true,
    integrationEnabled: false,
  }), true);
  assert.equal(shouldAutomaticallyConnectIntegrations({
    trigger: 'startup',
    authenticated: true,
    autoConnectEnabled: true,
    integrationEnabled: true,
  }), false);
});

test('не подключает без авторизации или после явного отключения', () => {
  assert.equal(shouldAutomaticallyConnectIntegrations({
    trigger: 'login',
    authenticated: false,
    autoConnectEnabled: true,
    integrationEnabled: false,
  }), false);
  assert.equal(shouldAutomaticallyConnectIntegrations({
    trigger: 'startup',
    authenticated: true,
    autoConnectEnabled: false,
    integrationEnabled: false,
  }), false);
});
