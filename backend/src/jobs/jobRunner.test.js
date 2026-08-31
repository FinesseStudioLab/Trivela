import assert from 'node:assert/strict';
import test from 'node:test';
import { createJobRunner, computeBackoffMs } from './jobRunner.js';
import { getRequestId, runWithRequestId } from '../lib/requestContext.js';

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

test('jobRunner getStatus reports queue depth and in-flight state (#930)', async () => {
  let resolveStarted;
  const started = new Promise((resolve) => {
    resolveStarted = resolve;
  });
  let resolveHandler;
  const runner = createJobRunner({
    handlers: {
      slow: () =>
        new Promise((resolve) => {
          resolveStarted();
          resolveHandler = resolve;
        }),
    },
    logger: silentLogger(),
  });

  assert.deepEqual(runner.getStatus(), { queued: 0, running: 0 });

  runner.enqueue('slow', null, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 5 });
  runner.enqueue('other', null, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 5 });

  await started;
  assert.deepEqual(runner.getStatus(), { queued: 1, running: 1 });

  resolveHandler();
  const deadline = Date.now() + 500;
  while (runner.getStatus().running === 1 && Date.now() < deadline) {
    await tick(5);
  }
  runner.stop();

  assert.deepEqual(runner.getStatus(), { queued: 0, running: 0 });
});

// ── Correlation ID propagation (#925) ───────────────────────────────────────

test('a job enqueued from within a request context runs with that same requestId', async () => {
  let observed;
  const runner = createJobRunner({
    handlers: {
      correlated: async () => {
        observed = getRequestId();
      },
    },
    logger: silentLogger(),
  });

  runWithRequestId('req-from-handler', () => {
    runner.enqueue('correlated', null, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 5 });
  });

  const deadline = Date.now() + 500;
  while (observed === undefined && Date.now() < deadline) {
    await tick(5);
  }
  runner.stop();

  assert.equal(observed, 'req-from-handler');
});

test('a job enqueued outside any request context still gets a correlation ID at run time', async () => {
  let observed;
  const runner = createJobRunner({
    handlers: {
      uncorrelated: async () => {
        observed = getRequestId();
      },
    },
    logger: silentLogger(),
  });

  // No runWithRequestId wrapper — mirrors a cron-triggered enqueue().
  runner.enqueue('uncorrelated', null, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 5 });

  const deadline = Date.now() + 500;
  while (observed === undefined && Date.now() < deadline) {
    await tick(5);
  }
  runner.stop();

  assert.ok(observed, 'a fallback correlation ID should have been minted for the job run');
  assert.match(observed, /^[0-9a-f-]{36}$/);
});

test('the correlation ID is preserved across retries of the same job', async () => {
  const seen = [];
  const runner = createJobRunner({
    handlers: {
      flaky: async () => {
        seen.push(getRequestId());
        if (seen.length < 2) throw new Error('transient');
      },
    },
    logger: silentLogger(),
  });

  runWithRequestId('req-retry', () => {
    runner.enqueue('flaky', null, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 });
  });

  const deadline = Date.now() + 1_000;
  while (seen.length < 2 && Date.now() < deadline) {
    await tick(5);
  }
  runner.stop();

  assert.equal(seen.length, 2);
  assert.equal(seen[0], 'req-retry');
  assert.equal(seen[1], 'req-retry');
});

test('two concurrently enqueued jobs from different requests do not cross-contaminate their correlation IDs', async () => {
  const observed = {};
  const runner = createJobRunner({
    handlers: {
      tagA: async () => {
        observed.a = getRequestId();
      },
      tagB: async () => {
        observed.b = getRequestId();
      },
    },
    logger: silentLogger(),
  });

  runWithRequestId('req-a', () => {
    runner.enqueue('tagA', null, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 5 });
  });
  runWithRequestId('req-b', () => {
    runner.enqueue('tagB', null, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 5 });
  });

  const deadline = Date.now() + 500;
  while ((!observed.a || !observed.b) && Date.now() < deadline) {
    await tick(5);
  }
  runner.stop();

  assert.equal(observed.a, 'req-a');
  assert.equal(observed.b, 'req-b');
});
