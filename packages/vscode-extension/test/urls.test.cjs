const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeApiBaseUrl,
  normalizeExternalUrl,
  parseSafeHttpUrl
} = require('../dist/urls.js');

test('разрешает HTTPS и локальный HTTP', () => {
  assert.equal(normalizeApiBaseUrl('https://api.kodpauza.ru/'), 'https://api.kodpauza.ru');
  assert.equal(normalizeApiBaseUrl('http://localhost:4000/'), 'http://localhost:4000');
  assert.equal(normalizeExternalUrl('http://127.0.0.1:3000/path'), 'http://127.0.0.1:3000/path');
});

test('запрещает удалённый HTTP и небезопасные схемы', () => {
  assert.throws(() => parseSafeHttpUrl('http://example.ru'), /HTTPS/);
  assert.throws(() => parseSafeHttpUrl('file:///tmp/ad.html'), /HTTPS/);
  assert.throws(() => parseSafeHttpUrl('javascript:alert(1)'), /HTTPS/);
  assert.throws(() => parseSafeHttpUrl('https://user:secret@example.ru'), /HTTPS/);
});

test('адрес API не принимает query и fragment', () => {
  assert.throws(() => normalizeApiBaseUrl('https://api.kodpauza.ru?token=secret'), /HTTPS/);
  assert.throws(() => normalizeApiBaseUrl('https://api.kodpauza.ru/#debug'), /HTTPS/);
});
