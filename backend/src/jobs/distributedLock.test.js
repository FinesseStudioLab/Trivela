import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemoryLock, createDistributedLock } from './distributedLock.js';

function tick(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── In-memory lock tests (no Redis required) ────────────────────────────────

test('createInMemoryLock: acquire returns a lock on first call', async () => {
  const lock = createInMemoryLock();
  const result = await lock.acquire('job_a');
  assert.ok(result, 'should return a lock object');
  assert.ok(typeof result.nonce === 'string', 'lock has nonce');
  await lock.release('job_a', result);
});

test('createInMemoryLock: acquire returns null while the lock is held', async () => {
  const lock = createInMemoryLock({ ttlMs: 5_000 });
  const first = await lock.acquire('job_b');
  assert.ok(first);
  const second = await lock.acquire('job_b');
  assert.equal(second, null, 'should return null while first lock is held');
  await lock.release('job_b', first);
});

test('createInMemoryLock: acquire succeeds after release', async () => {
  const lock = createInMemoryLock({ ttlMs: 5_000 });
  const first = await lock.acquire('job_c');
  assert.ok(first);
  await lock.release('job_c', first);
  const second = await lock.acquire('job_c');
  assert.ok(second, 'should acquire after release');
  assert.notEqual(second.nonce, first.nonce, 'nonces should differ');
  await lock.release('job_c', second);
});

test('createInMemoryLock: stale nonce release does not evict live lock', async () => {
  const lock = createInMemoryLock({ ttlMs: 5_000 });
  const live = await lock.acquire('job_d');
  assert.ok(live);
  // Release with a fabricated stale lock
  await lock.release('job_d', { nonce: 'stale-nonce-000' });
  // Live lock must still be held
  const attempt = await lock.acquire('job_d');
  assert.equal(attempt, null, 'live lock must still block acquisition');
  await lock.release('job_d', live);
});

test('createInMemoryLock: acquire succeeds after TTL expiry', async () => {
  const lock = createInMemoryLock({ ttlMs: 1 });
  const first = await lock.acquire('job_e');
  assert.ok(first);
  await tick(5); // wait for TTL to expire
  const second = await lock.acquire('job_e');
  assert.ok(second, 'should acquire after TTL has expired');
  await lock.release('job_e', second);
});

// ── Redis mock tests ─────────────────────────────────────────────────────────

function makeRedisMock() {
  /** @type {Map<string, { val: string, expiry: number }>} */
  const store = new Map();
  const pexpireCalls = [];
  const evalCalls = [];

  return {
    store,
    pexpireCalls,
    evalCalls,
    async set(key, val, nx, px, ttl) {
      if (nx === 'NX') {
        const existing = store.get(key);
        if (existing && existing.expiry > Date.now()) return null;
      }
      store.set(key, { val, expiry: Date.now() + ttl });
      return 'OK';
    },
    async pexpire(key, ttl) {
      pexpireCalls.push({ key, ttl });
      const entry = store.get(key);
      if (entry) entry.expiry = Date.now() + ttl;
    },
    async eval(_script, _numKeys, key, nonce) {
      evalCalls.push({ key, nonce });
      const entry = store.get(key);
      if (entry?.val === nonce) {
        store.delete(key);
        return 1;
      }
      return 0;
    },
  };
}

test('createDistributedLock: acquire returns a lock on first call', async () => {
  const redis = makeRedisMock();
  const dl = createDistributedLock(redis, { ttlMs: 5_000 });
  const result = await dl.acquire('myjob');
  assert.ok(result, 'should return lock');
  assert.ok(typeof result.nonce === 'string');
  // Verify the key stored has the lock:job: prefix
  assert.ok(redis.store.has('lock:job:myjob'), 'key must have lock:job: prefix');
  await dl.release('myjob', result);
});

test('createDistributedLock: acquire returns null while lock is held', async () => {
  const redis = makeRedisMock();
  const dl = createDistributedLock(redis, { ttlMs: 5_000 });
  const first = await dl.acquire('myjob2');
  assert.ok(first);
  const second = await dl.acquire('myjob2');
  assert.equal(second, null, 'second acquire should fail while first is held');
  await dl.release('myjob2', first);
});

test('createDistributedLock: release uses lock:job: prefix in eval', async () => {
  const redis = makeRedisMock();
  const dl = createDistributedLock(redis, { ttlMs: 5_000 });
  const lock = await dl.acquire('myjob3');
  assert.ok(lock);
  await dl.release('myjob3', lock);
  assert.equal(redis.evalCalls.length, 1, 'eval should be called once on release');
  const evalCall = redis.evalCalls[0];
  assert.equal(evalCall.key, 'lock:job:myjob3', 'eval key must have lock:job: prefix');
  assert.equal(evalCall.nonce, lock.nonce, 'eval must pass the correct nonce');
});

test('createDistributedLock: release clears heartbeat', async () => {
  const redis = makeRedisMock();
  const dl = createDistributedLock(redis, { ttlMs: 30 });
  const lock = await dl.acquire('myjob4');
  assert.ok(lock);
  await dl.release('myjob4', lock);
  const callsBefore = redis.pexpireCalls.length;
  await tick(40); // wait past one heartbeat interval
  // After release, heartbeat should be cleared — no new pexpire calls
  assert.equal(redis.pexpireCalls.length, callsBefore, 'heartbeat must stop after release');
});

// ── Backward compat: jobRunner works without lockProvider ──────────────────

test('createJobRunner without lockProvider: existing tests still pass', async () => {
  const { createJobRunner } = await import('./jobRunner.js');
  const dl = { entries: [], record(e) { this.entries.push(e); } };
  let ran = 0;
  const runner = createJobRunner({
    handlers: { x: async () => { ran += 1; } },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    deadLetter: dl,
  });
  runner.enqueue('x', null);
  const deadline = Date.now() + 500;
  while (ran === 0 && Date.now() < deadline) await tick(10);
  runner.stop();
  assert.equal(ran, 1, 'job should run without lockProvider');
  assert.equal(dl.entries.length, 0);
});
