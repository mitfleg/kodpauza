const test = require('node:test');
const assert = require('node:assert/strict');
const {
  acknowledgeTelemetry,
  deferTelemetry,
  enqueueTelemetry,
  isPendingTelemetryEvent,
  retryDelayMs
} = require('../dist/telemetry.js');

function pending(id, attempts = 0) {
  return {
    id,
    type: 'impression',
    attempts,
    createdAt: '2026-07-13T12:00:00.000Z',
    nextAttemptAt: '2026-07-13T12:00:00.000Z',
    event: {
      eventId: id,
      adId: 'ad-1',
      campaignId: 'campaign-1',
      surface: 'codex_vscode',
      visibleMs: 5000,
      clientVersion: '0.1.0',
      toolName: 'codex',
      toolVersion: '0.1.0'
    }
  };
}

test('повторная постановка сохраняет один и тот же eventId', () => {
  const first = pending('event-1');
  const replacement = { ...pending('event-1'), attempts: 2 };
  const queue = enqueueTelemetry([first], replacement);

  assert.equal(queue.length, 1);
  assert.equal(queue[0].event.eventId, 'event-1');
  assert.equal(queue[0].attempts, 2);
});

test('неуспешная отправка откладывается с экспоненциальной задержкой', () => {
  const now = Date.parse('2026-07-13T12:00:00.000Z');
  const [deferred] = deferTelemetry([pending('event-1')], 'event-1', now);

  assert.equal(deferred.attempts, 1);
  assert.equal(deferred.nextAttemptAt, '2026-07-13T12:00:05.000Z');
  assert.equal(retryDelayMs(20), 300000);
});

test('подтверждение удаляет только доставленное событие', () => {
  const queue = acknowledgeTelemetry([pending('event-1'), pending('event-2')], 'event-1');
  assert.deepEqual(queue.map((item) => item.id), ['event-2']);
  assert.equal(isPendingTelemetryEvent(queue[0]), true);
});

test('повреждённая запись не считается событием очереди', () => {
  assert.equal(isPendingTelemetryEvent({ ...pending('event-1'), event: { eventId: 'other' } }), false);
  assert.equal(isPendingTelemetryEvent({ ...pending('event-1'), nextAttemptAt: 'не дата' }), false);
});
