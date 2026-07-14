const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { webviewVisibilityRuntime } = require('../dist/uiVisibilityRuntime.js');

function evaluateVisibility(overrides = {}) {
  const documentElement = {};
  const parent = { parentElement: documentElement };
  const element = {
    isConnected: true,
    parentElement: parent,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 100, top: 100, right: 300, bottom: 130, width: 200, height: 30 }),
    contains: (candidate) => candidate === element,
    ...overrides.element
  };
  const style = new Map([
    [element, { display: 'inline-flex', visibility: 'visible', contentVisibility: 'visible', opacity: '1' }],
    [parent, { display: 'block', visibility: 'visible', contentVisibility: 'visible', opacity: '1' }]
  ]);
  if (overrides.parentStyle) style.set(parent, { ...style.get(parent), ...overrides.parentStyle });
  const context = {
    element,
    window: {
      innerWidth: 1_000,
      innerHeight: 800,
      addEventListener() {},
      removeEventListener() {},
      ...overrides.window
    },
    document: {
      visibilityState: 'visible',
      documentElement,
      elementFromPoint: () => element,
      addEventListener() {},
      removeEventListener() {},
      ...overrides.document
    },
    getComputedStyle: (node) => style.get(node),
    fetch: async () => ({ ok: true }),
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    IntersectionObserver: undefined
  };
  const runtime = webviewVisibilityRuntime('__kp', '__kpEndpoint', '__kpToken');
  vm.runInNewContext(
    `var __kpEndpoint="http://127.0.0.1",__kpToken="token";${runtime};globalThis.answer=__kpElementIsVisible(element);`,
    context
  );
  return context.answer;
}

test('DOM visibility proof принимает реально видимый рекламный элемент', () => {
  assert.equal(evaluateVisibility(), true);
});

test('DOM visibility proof отклоняет скрытый или свернутый блок рассуждения', () => {
  assert.equal(evaluateVisibility({ document: { visibilityState: 'hidden' } }), false);
  assert.equal(evaluateVisibility({ element: { closest: () => ({}) } }), false);
  assert.equal(evaluateVisibility({ parentStyle: { display: 'none' } }), false);
  assert.equal(evaluateVisibility({ parentStyle: { opacity: '0' } }), false);
});

test('DOM visibility proof отклоняет элемент вне viewport и перекрытую рекламу', () => {
  assert.equal(evaluateVisibility({
    element: {
      getBoundingClientRect: () => ({ left: 100, top: 900, right: 300, bottom: 930, width: 200, height: 30 })
    }
  }), false);
  assert.equal(evaluateVisibility({ document: { elementFromPoint: () => ({}) } }), false);
});
