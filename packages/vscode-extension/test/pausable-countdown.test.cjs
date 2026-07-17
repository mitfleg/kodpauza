const test = require('node:test');
const assert = require('node:assert/strict');
const { PausableCountdown } = require('../dist/pausableCountdown.js');

test('таймер ротации учитывает только активное время показа', () => {
  let now = 1_000;
  let elapsed = 0;
  const timers = new Set();
  const clock = {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const timer = { callback, at: now + delayMs, unref() {} };
      timers.add(timer);
      return timer;
    },
    clearTimeout: (timer) => timers.delete(timer),
  };
  const advance = (delayMs) => {
    now += delayMs;
    for (const timer of [...timers].sort((left, right) => left.at - right.at)) {
      if (timer.at <= now && timers.delete(timer)) {
        timer.callback();
      }
    }
  };

  const countdown = new PausableCountdown(30_000, () => { elapsed += 1; }, clock);
  countdown.resume();
  assert.equal(countdown.deadlineAt, 31_000);
  advance(12_000);
  countdown.pause();
  assert.equal(countdown.remainingMs, 18_000);

  advance(60_000);
  assert.equal(elapsed, 0);
  countdown.resume();
  assert.equal(countdown.deadlineAt, 91_000);
  advance(17_999);
  assert.equal(elapsed, 0);
  advance(1);
  assert.equal(elapsed, 1);

  countdown.reset();
  assert.equal(countdown.remainingMs, 30_000);
});
