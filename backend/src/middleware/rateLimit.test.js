// @ts-check
//
// Unit tests for the rate-limit middleware (#104).
//
// The rate limiter is the load-bearing protection against /api/* abuse —
// every public route on the API mounts it. The tests below pin:
//
//   - The standard X-RateLimit-* headers (RFC draft compatible)
//   - The 429 + Retry-After path when the bucket is exhausted
//   - Per-API-key vs per-IP keying
//   - In-memory bucket lifecycle: reset after the window elapses
//   - Redis-store path with a fake Redis client
//   - Defensive next(err) handling when the store throws
//
// Tests run under node:test (matching logger.test.js) so they're picked
// up by the existing `npm test` script without an extra runner.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRateLimiter,
  createMemoryStore,
  createRedisStore,
} from './rateLimit.js';

function makeReqRes({ apiKey, ip = '1.1.1.1', method = 'GET' } = {}) {
  const headers = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  const req = { method, headers, query: {}, ip, socket: { remoteAddress: ip } };
  const headersOut = {};
  const res = {
    statusCode: 200,
    headersOut,
    setHeader(name, value) {
      headersOut[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return { req, res };
}

test('rateLimit attaches RFC-style X-RateLimit-* headers on every response', async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
  const { req, res } = makeReqRes();
  let called = false;
  await limiter(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.headersOut['X-RateLimit-Limit'], '5');
  assert.equal(res.headersOut['X-RateLimit-Remaining'], '4');
  assert.ok(Number(res.headersOut['X-RateLimit-Reset']) > 0);
  assert.equal(res.headersOut['RateLimit-Policy'], '5;w=60');
  assert.match(
    res.headersOut['RateLimit'],
    /limit=5, remaining=4, reset=\d+/,
  );
});

test('rateLimit returns 429 + Retry-After once the bucket is exhausted', async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
  for (let i = 0; i < 2; i += 1) {
    const { req, res } = makeReqRes();
    await limiter(req, res, () => {});
    assert.equal(res.statusCode, 200);
  }
  const { req, res } = makeReqRes();
  let nextCalled = false;
  await limiter(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, 'next() must not run after the bucket is empty');
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(res.body.limit, 2);
  assert.ok(Number(res.headersOut['Retry-After']) > 0);
});

test('rateLimit keys by API key when one is present (per-key buckets)', async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
  // Two requests with two different API keys must each succeed.
  const a = makeReqRes({ apiKey: 'sk_alice' });
  await limiter(a.req, a.res, () => {});
  const b = makeReqRes({ apiKey: 'sk_bob' });
  await limiter(b.req, b.res, () => {});
  assert.equal(a.res.statusCode, 200);
  assert.equal(b.res.statusCode, 200);
  // A third request reusing Alice's key trips the limit.
  const a2 = makeReqRes({ apiKey: 'sk_alice' });
  await limiter(a2.req, a2.res, () => {});
  assert.equal(a2.res.statusCode, 429);
});

test('rateLimit falls back to per-IP keying when no API key is supplied', async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
  const a = makeReqRes({ ip: '1.1.1.1' });
  await limiter(a.req, a.res, () => {});
  const b = makeReqRes({ ip: '2.2.2.2' });
  await limiter(b.req, b.res, () => {});
  assert.equal(a.res.statusCode, 200);
  assert.equal(b.res.statusCode, 200);
  // Same IP twice → second hit is rate-limited.
  const a2 = makeReqRes({ ip: '1.1.1.1' });
  await limiter(a2.req, a2.res, () => {});
  assert.equal(a2.res.statusCode, 429);
});

test('in-memory bucket resets after windowMs elapses', async () => {
  // Use the injectable timeProvider + a fresh store to control "now".
  let now = 1_000_000;
  const store = createMemoryStore();
  const limiter = createRateLimiter({
    windowMs: 100,
    maxRequests: 1,
    timeProvider: () => now,
    store,
  });
  // First call succeeds, second tripped at the same "now".
  const a = makeReqRes();
  await limiter(a.req, a.res, () => {});
  assert.equal(a.res.statusCode, 200);
  const b = makeReqRes();
  await limiter(b.req, b.res, () => {});
  assert.equal(b.res.statusCode, 429);
  // Advance past the window: the memory store re-issues a fresh bucket.
  now += 500;
  const c = makeReqRes();
  await limiter(c.req, c.res, () => {});
  assert.equal(c.res.statusCode, 200);
});

test('rateLimit forwards store errors via next(err) instead of crashing the request', async () => {
  const explodingStore = {
    async increment() {
      throw new Error('store unavailable');
    },
  };
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5, store: explodingStore });
  const { req, res } = makeReqRes();
  let captured;
  await limiter(req, res, (err) => { captured = err; });
  assert.equal(captured?.message, 'store unavailable');
  assert.equal(res.statusCode, 200, 'must not 429 on store failure');
});

// ── Redis-store integration ─────────────────────────────────────────────────

function makeFakeRedis() {
  const map = new Map();
  // Soroban-level fake: only the methods the store actually uses.
  return {
    counts: new Map(),
    ttls: new Map(),
    multi() {
      const tx = { ops: [] };
      const self = this;
      tx.incr = (k) => { tx.ops.push(['incr', k]); return tx; };
      tx.pttl = (k) => { tx.ops.push(['pttl', k]); return tx; };
      tx.exec = async () => {
        const out = [];
        for (const [op, k] of tx.ops) {
          if (op === 'incr') {
            const v = (self.counts.get(k) ?? 0) + 1;
            self.counts.set(k, v);
            out.push([null, v]);
          } else if (op === 'pttl') {
            out.push([null, self.ttls.get(k) ?? -1]);
          }
        }
        return out;
      };
      return tx;
    },
    async pexpire(k, ms) {
      this.ttls.set(k, ms);
      return 1;
    },
  };
}

test('createRedisStore: sets TTL on first hit and reads it on subsequent hits', async () => {
  const redis = makeFakeRedis();
  const store = createRedisStore(redis);
  const r1 = await store.increment('ip:1.1.1.1', 5000);
  assert.equal(r1.count, 1);
  assert.equal(redis.ttls.get('ratelimit:ip:1.1.1.1'), 5000);
  const r2 = await store.increment('ip:1.1.1.1', 5000);
  assert.equal(r2.count, 2);
  // Second call read pttl as 5000 (set by first call) → resetAt stays
  // close to "now + 5000". We don't pin the exact timestamp because
  // Date.now() ticks during the test; just verify it's in the window.
  assert.ok(r2.resetAt >= Date.now() && r2.resetAt <= Date.now() + 5000 + 50);
});

test('createRedisStore: throws when the multi() pipeline reports an error', async () => {
  const failingRedis = {
    multi() {
      return {
        incr() { return this; },
        pttl() { return this; },
        async exec() {
          return [[new Error('READONLY')], null];
        },
      };
    },
    async pexpire() { return 1; },
  };
  const store = createRedisStore(failingRedis);
  await assert.rejects(() => store.increment('k', 5000), /Redis rate limit increment failed/);
});
