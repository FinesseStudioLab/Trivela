import assert from 'node:assert/strict';
import test from 'node:test';
import { createJobRunner, computeBackoffMs } from './jobRunner.js';

/**
 * Minimal logger that swallows output but lets tests inspect counts.
 */
function silentLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

/**
 * In-memory dead-letter stub that captures every call to `record()`.
 */
function inMemoryDeadLetter() {
  const entries = [];
  return {
    entries,
    record(entry) {
      entries.push(entry);
      return `dl_${entries.length}`;
    },
  };
}

/**
 * Helper that resolves on the next macrotask so queued setTimeout(0)
 * callbacks have a chance to fire.
 */
function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('computeBackoffMs grows exponentially and respects the cap', () => {
  const base = 100;
  const cap = 1_000;
  const a1 = computeBackoffMs({ attempt: 1, baseDelayMs: base, maxDelayMs: cap });
  const a3 = computeBackoffMs({ attempt: 3, baseDelayMs: base, maxDelayMs: cap });
  const a8 = computeBackoffMs({ attempt: 8, baseDelayMs: base, maxDelayMs: cap });

  // attempt 1 => base + jitter (jitter < 250) so always < base + 250
  assert.ok(a1 >= base && a1 < base + 250, `a1=${a1}`);
  // attempt 3 should be at least 4x base (2^(3-1)=4)
  assert.ok(a3 >= base * 4, `a3=${a3}`);
  // attempt 8 must be capped
  assert.equal(a8, cap, `a8=${a8} should be capped at ${cap}`);
});

test('jobRunner retries failing jobs up to maxAttempts and then dead-letters', async () => {
  const deadLetter = inMemoryDeadLetter();
  let attempts = 0;

  const runner = createJobRunner({
    handlers: {
      flaky: async () => {
        attempts += 1;
        throw new Error('boom');
      },
    },
    logger: silentLogger(),
    deadLetter,
  });

  runner.enqueue(
    'flaky',
    { id: 'x' },
    {
      maxAttempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
    },
  );

  // The retry backoffs add up to <50ms; 200ms is plenty for all attempts.
  const deadline = Date.now() + 1_000;
  while (deadLetter.entries.length === 0 && Date.now() < deadline) {
    await tick(10);
  }
  runner.stop();

  assert.equal(attempts, 3, 'handler should run for each attempt');
  assert.equal(deadLetter.entries.length, 1, 'job must dead-letter after final attempt');
  const entry = deadLetter.entries[0];
  assert.equal(entry.type, 'flaky');
  assert.deepEqual(entry.payload, { id: 'x' });
  assert.equal(entry.attempts, 3);
  assert.equal(entry.errorMessage, 'boom');
  assert.ok(entry.enqueuedAt, 'enqueuedAt should be propagated');
});

test('jobRunner does not dead-letter when the handler eventually succeeds', async () => {
  const deadLetter = inMemoryDeadLetter();
  let attempts = 0;

  const runner = createJobRunner({
    handlers: {
      eventually_ok: async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('transient');
      },
    },
    logger: silentLogger(),
    deadLetter,
  });

  runner.enqueue('eventually_ok', null, {
    maxAttempts: 3,
    baseDelayMs: 1,
    maxDelayMs: 5,
  });

  const deadline = Date.now() + 500;
  while (attempts < 2 && Date.now() < deadline) {
    await tick(5);
  }
  // Give the runner an extra moment to settle so we can confirm no dead-letter.
  await tick(20);
  runner.stop();

  assert.equal(attempts, 2, 'handler should have run twice');
  assert.equal(deadLetter.entries.length, 0, 'success must not dead-letter');
});

test('jobRunner logs but does not crash when the dead-letter store throws', async () => {
  let recorded = false;
  let loggedError = false;

  const runner = createJobRunner({
    handlers: {
      always_fails: async () => {
        throw new Error('nope');
      },
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {
        loggedError = true;
      },
      debug: () => {},
    },
    deadLetter: {
      record() {
        recorded = true;
        throw new Error('disk full');
      },
    },
  });

  runner.enqueue('always_fails', null, {
    maxAttempts: 1,
    baseDelayMs: 1,
    maxDelayMs: 5,
  });

  const deadline = Date.now() + 500;
  while (!recorded && Date.now() < deadline) {
    await tick(5);
  }
  runner.stop();

  assert.ok(recorded, 'dead-letter record() should be attempted');
  assert.ok(loggedError, 'failure to persist should be logged');
});

test('jobRunner uses environment-driven defaults when enqueue omits options', async () => {
  let observedMaxAttempts = null;
  let attempts = 0;
  const deadLetter = {
    record(entry) {
      observedMaxAttempts = entry.attempts;
    },
  };

  const runner = createJobRunner({
    handlers: {
      doomed: async () => {
        attempts += 1;
        throw new Error('x');
      },
    },
    logger: silentLogger(),
    deadLetter,
    defaultMaxAttempts: 2,
    defaultBaseDelayMs: 1,
    defaultMaxDelayMs: 5,
  });

  runner.enqueue('doomed', null);

  const deadline = Date.now() + 500;
  while (observedMaxAttempts === null && Date.now() < deadline) {
    await tick(5);
  }
  runner.stop();

  assert.equal(attempts, 2, 'runner should respect defaultMaxAttempts');
  assert.equal(observedMaxAttempts, 2);
});
