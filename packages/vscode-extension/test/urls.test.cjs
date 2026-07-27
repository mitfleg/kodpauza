const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAdClickUrl,
  normalizeApiBaseUrl,
  normalizeExternalUrl,
  parseSafeHttpUrl,
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

test('добавляет ERID в ссылку объявления и сохраняет остальные части URL', () => {
  assert.equal(
    normalizeAdClickUrl('https://kodpauza.ru/install?utm_source=extension#download', 'token-123'),
    'https://kodpauza.ru/install?utm_source=extension&erid=token-123#download',
  );
});

test('заменяет устаревший ERID и игнорирует пустой токен', () => {
  assert.equal(
    normalizeAdClickUrl('https://kodpauza.ru/install?erid=old', 'new'),
    'https://kodpauza.ru/install?erid=new',
  );
  assert.equal(
    normalizeAdClickUrl(
      'https://kodpauza.ru/install?erid=old&utm_source=extension&erid=duplicate#start',
      'new',
    ),
    'https://kodpauza.ru/install?erid=new&utm_source=extension#start',
  );
  assert.equal(
    normalizeAdClickUrl('https://kodpauza.ru/install', '   '),
    'https://kodpauza.ru/install',
  );
});

test('повторная установка ERID идемпотентна', () => {
  const marked = normalizeAdClickUrl(
    'https://kodpauza.ru/install?utm_source=extension#download',
    'token-123',
  );
  assert.equal(normalizeAdClickUrl(marked, 'token-123'), marked);
});

test('ссылка объявления разрешает только безопасные HTTP/HTTPS-адреса', () => {
  assert.equal(
    normalizeAdClickUrl('http://localhost:3000/install', 'token-123'),
    'http://localhost:3000/install?erid=token-123',
  );
  assert.throws(() => normalizeAdClickUrl('http://example.ru/install', 'token-123'), /HTTPS/);
  assert.throws(() => normalizeAdClickUrl('javascript:alert(1)', 'token-123'), /HTTPS/);
  assert.throws(
    () => normalizeAdClickUrl('https://user:secret@example.ru/install', 'token-123'),
    /HTTPS/,
  );
});
