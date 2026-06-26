// @ts-check
//
// Unit tests for the brute-force / lockout middleware (#588).
//
// These pin the behaviour that actually protects the auth endpoints:
//
//   - failed attempts (401) accumulate per client; successes (2xx/3xx) reset
//   - a progressive, exponentially-growing delay kicks in past the soft
//     threshold and is capped at maxDelayMs
//   - a temporary lockout (429 + Retry-After) kicks in past the hard threshold
//   - lockouts expire on the clock, and repeat episodes back off exponentially
//   - the failure window is a sliding reset
//   - keying is per-IP and independent across clients
//   - the in-memory store is bounded (oldest-key eviction)
//   - onFailure / onLockout hooks fire for metrics + alerting
//
// Tests run under node:test (matching rateLimit.test.js) so `npm test` picks
// them up with no extra runner. The clock, delay, and store are all injected so
// the tests are deterministic and never actually sleep.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthLockout, createLockoutMemoryStore } from './authLockout.js';

/** @param {{ ip?: string }} [opts] */
function makeReqRes({ ip = '1.1.1.1' } = {}) {
  /** @type {Array<() => void>} */
  const finishListeners = [];
  /** @type {Record<string, string>} */
  const headersOut = {};
  const req = { headers: {}, query: {}, ip, socket: { remoteAddress: ip } };
  const res = {
    statusCode: 200,
    headersOut,
    /** @type {unknown} */
    body: undefined,
    setHeader(/** @type {string} */ name, /** @type {string} */ value) {
      headersOut[name] = value;
    },
    status(/** @type {number} */ code) {
      this.statusCode = code;
      return this;
    },
    json(/** @type {unknown} */ payload) {
      this.body = payload;
      return this;
    },
    on(/** @type {string} */ event, /** @type {() => void} */ cb) {
      if (event === 'finish') finishListeners.push(cb);
      return this;
    },
    // Test helper: simulate the response completing with a final status.
    finish(/** @type {number} */ code) {
      this.statusCode = code;
      for (const cb of finishListeners) cb();
    },
  };
  return { req, res };
}

/**
 * Drive one request through the guard. When the guard lets it through, we
 * simulate the downstream auth middleware's outcome via res.finish(outcome).
 *
 * @param {import('express').RequestHandler} guard
 * @param {{ ip?: string, outcome?: number }} [opts]
 */
async function attempt(guard, { ip = '1.1.1.1', outcome = 401 } = {}) {
  const { req, res } = makeReqRes({ ip });
  let nextCalled = false;
  await guard(/** @type {any} */ (req), /** @type {any} */ (res), () => {
    nextCalled = true;
  });
  if (nextCalled) {
    res.finish(outcome);
  }
  return { req, res, nextCalled };
}

test('below the soft threshold: no delay, attempts pass through, failures accumulate', async () => {
  const store = createLockoutMemoryStore();
  /** @type {number[]} */
  const delays = [];
  const guard = createAuthLockout({
    softThreshold: 2,
    hardThreshold: 5,
    store,
    delayFn: async (ms) => {
      delays.push(ms);
    },
  });

  const a1 = await attempt(guard);
  const a2 = await attempt(guard);
  assert.equal(a1.nextCalled, true);
  assert.equal(a2.nextCalled, true);
  assert.deepEqual(delays, [], 'no delay below the soft threshold');
  assert.equal(store.get('ip:1.1.1.1')?.failures, 2);
});

test('a successful (2xx) attempt clears the failure record', async () => {
  const store = createLockoutMemoryStore();
  const guard = createAuthLockout({
    softThreshold: 2,
    hardThreshold: 5,
    store,
    delayFn: async () => {},
  });

  await attempt(guard, { outcome: 401 });
  await attempt(guard, { outcome: 401 });
  assert.equal(store.get('ip:1.1.1.1')?.failures, 2);

  await attempt(guard, { outcome: 200 });
  assert.equal(store.get('ip:1.1.1.1'), undefined, 'success wipes the record');
});

test('progressive delay grows exponentially past the soft threshold and caps at maxDelayMs', async () => {
  const store = createLockoutMemoryStore();
  /** @type {number[]} */
  const delays = [];
  const guard = createAuthLockout({
    softThreshold: 2,
    hardThreshold: 5,
    baseDelayMs: 100,
    maxDelayMs: 400,
    store,
    delayFn: async (ms) => {
      delays.push(ms);
    },
  });

  // 5 consecutive 401s. The 3rd/4th/5th sit past the soft threshold.
  for (let i = 0; i < 5; i += 1) {
    await attempt(guard);
  }
  // over = 1,2,3 → 100, 200, 400 (400 = base*2^2; the 400 cap also holds).
  assert.deepEqual(delays, [100, 200, 400]);
});

test('locks out with 429 + Retry-After once the hard threshold is reached', async () => {
  const store = createLockoutMemoryStore();
  const guard = createAuthLockout({
    softThreshold: 2,
    hardThreshold: 3,
    baseLockoutMs: 1000,
    store,
    delayFn: async () => {},
  });

  await attempt(guard); // f1
  await attempt(guard); // f2
  await attempt(guard); // f3 → triggers lockout

  // Next request is blocked outright, before any auth runs.
  const blocked = await attempt(guard);
  assert.equal(blocked.nextCalled, false, 'next() must not run while locked out');
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(/** @type {any} */ (blocked.res.body).code, 'AUTH_LOCKED_OUT');
  assert.ok(Number(blocked.res.headersOut['Retry-After']) > 0);
  assert.equal(blocked.res.headersOut['X-Auth-Lockout'], 'active');
});

test('lockout expires on the clock; a repeat lockout backs off exponentially', async () => {
  let now = 1_000_000;
  const store = createLockoutMemoryStore();
  /** @type {Array<{ lockoutMs: number, lockoutCount: number }>} */
  const lockouts = [];
  const guard = createAuthLockout({
    softThreshold: 2,
    hardThreshold: 3,
    baseLockoutMs: 1000,
    maxLockoutMs: 60_000,
    failureWindowMs: 10_000,
    timeProvider: () => now,
    store,
    delayFn: async () => {},
    onLockout: (info) =>
      lockouts.push({ lockoutMs: info.lockoutMs, lockoutCount: info.lockoutCount }),
  });

  await attempt(guard); // f1
  await attempt(guard); // f2
  await attempt(guard); // f3 → first lockout (1000ms)
  assert.deepEqual(lockouts[0], { lockoutMs: 1000, lockoutCount: 1 });

  // Still locked just before expiry.
  now += 999;
  assert.equal((await attempt(guard)).nextCalled, false);

  // After expiry the request is allowed through again...
  now += 2;
  const after = await attempt(guard); // f4 → re-locks (2nd episode)
  assert.equal(after.nextCalled, true);
  assert.deepEqual(lockouts[1], { lockoutMs: 2000, lockoutCount: 2 }, 'exponential back-off');
});

test('the failure window is a sliding reset once a key is no longer locked', async () => {
  let now = 1_000_000;
  const store = createLockoutMemoryStore();
  const guard = createAuthLockout({
    softThreshold: 2,
    hardThreshold: 10,
    failureWindowMs: 5_000,
    timeProvider: () => now,
    store,
    delayFn: async () => {},
  });

  await attempt(guard); // f1
  await attempt(guard); // f2
  assert.equal(store.get('ip:1.1.1.1')?.failures, 2);

  // Advance past the failure window with no lockout in effect.
  now += 5_001;
  await attempt(guard); // should start fresh
  assert.equal(store.get('ip:1.1.1.1')?.failures, 1, 'window elapsed → counter reset');
});

test('keying is per-IP: one client locking out does not affect another', async () => {
  const store = createLockoutMemoryStore();
  const guard = createAuthLockout({
    softThreshold: 2,
    hardThreshold: 3,
    store,
    delayFn: async () => {},
  });

  await attempt(guard, { ip: '10.0.0.1' });
  await attempt(guard, { ip: '10.0.0.1' });
  await attempt(guard, { ip: '10.0.0.1' }); // locks out 10.0.0.1

  const lockedClient = await attempt(guard, { ip: '10.0.0.1' });
  assert.equal(lockedClient.nextCalled, false);

  const otherClient = await attempt(guard, { ip: '10.0.0.2' });
  assert.equal(otherClient.nextCalled, true, 'a different IP is unaffected');
});

test('non-auth outcomes (e.g. 500) do not move the failure counter', async () => {
  const store = createLockoutMemoryStore();
  const guard = createAuthLockout({
    softThreshold: 2,
    hardThreshold: 5,
    store,
    delayFn: async () => {},
  });

  await attempt(guard, { outcome: 500 });
  assert.equal(store.get('ip:1.1.1.1'), undefined, 'a 500 is neither pass nor auth-reject');
});

test('onFailure and onLockout hooks fire for metrics/alerting', async () => {
  let failures = 0;
  let lockouts = 0;
  const guard = createAuthLockout({
    softThreshold: 2,
    hardThreshold: 3,
    delayFn: async () => {},
    onFailure: () => {
      failures += 1;
    },
    onLockout: () => {
      lockouts += 1;
    },
  });

  await attempt(guard);
  await attempt(guard);
  await attempt(guard); // 3rd failure → lockout

  assert.equal(failures, 3);
  assert.equal(lockouts, 1);
});

test('createLockoutMemoryStore bounds its size and evicts the oldest key', () => {
  const store = createLockoutMemoryStore({ maxEntries: 2 });
  const rec = () => ({
    failures: 1,
    firstFailureAt: 0,
    lockedUntil: 0,
    lockoutCount: 0,
    lastSeen: 0,
  });
  store.set('a', rec());
  store.set('b', rec());
  store.set('c', rec()); // evicts 'a'
  assert.equal(store.size, 2);
  assert.equal(store.get('a'), undefined);
  assert.ok(store.get('b'));
  assert.ok(store.get('c'));
});
