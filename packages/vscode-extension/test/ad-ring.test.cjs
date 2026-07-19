const test = require('node:test');
const assert = require('node:assert/strict');
const { AdRing } = require('../dist/adRing.js');

function ad(campaignId, advertiserName, expiresAt) {
  return {
    adId: `${campaignId}-${Math.random()}`,
    campaignId,
    advertiserName,
    text: campaignId,
    url: 'https://example.com',
    erid: null,
    durationSec: 5,
    surface: 'codex_vscode',
    trackable: true,
    format: 'standard',
    expiresAt,
  };
}

test('ring хранит от 3 до 10 уникальных кампаний и отбрасывает дубли', () => {
  const ring = new AdRing(3);
  assert.equal(ring.add(ad('alpha', 'A')), true);
  assert.equal(ring.add(ad('alpha', 'A')), false);
  assert.equal(ring.add(ad('beta', 'B')), true);
  assert.equal(ring.add(ad('gamma', 'C')), true);
  assert.equal(ring.add(ad('delta', 'D')), false);
  assert.equal(ring.size, 3);
  assert.throws(() => new AdRing(2), /between 3 and 10/);
  assert.throws(() => new AdRing(11), /between 3 and 10/);
});

test('не повторяет рекламодателя или кампанию до исчерпания локального набора', () => {
  const ring = new AdRing(6);
  ring.add(ad('alpha', 'Acme'));
  ring.add(ad('beta', 'Acme'));
  ring.add(ad('gamma', 'Beta'));
  ring.add(ad('delta', 'Delta'));

  assert.equal(ring.take().campaignId, 'alpha');
  assert.equal(ring.take().campaignId, 'gamma');
  assert.equal(ring.take().campaignId, 'delta');
  assert.equal(ring.take().campaignId, 'beta');
});

test('не выдаёт объявление после TTL и очищает историю вместе с сессией', () => {
  let now = Date.parse('2026-07-19T12:00:00.000Z');
  const ring = new AdRing(3, 1_000, () => now);
  ring.add(ad('alpha', 'Acme', new Date(now + 500).toISOString()));
  assert.equal(ring.size, 1);
  now += 501;
  assert.equal(ring.take(), undefined);

  ring.add(ad('beta', 'Beta'));
  ring.clear();
  assert.equal(ring.size, 0);
});
