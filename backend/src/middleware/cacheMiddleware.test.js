import assert from 'node:assert/strict';
import test from 'node:test';
import { createCacheMiddleware } from './cacheMiddleware.js';

function memoryCache(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    sets: [],
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value, ttl) {
      this.sets.push({ key, ttl });
      store.set(key, value);
    },
  };
}

function makeRes(statusCode = 200) {
  return {
    statusCode,
    headers: {},
    sent: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(body) {
      this.sent = body;
      return this;
    },
  };
}

test('non-GET requests bypass the cache entirely', async () => {
  const cache = memoryCache();
  let nextCalled = false;
  const res = makeRes();
  await createCacheMiddleware({ cacheService: cache })(
    { method: 'POST', originalUrl: '/x' },
    res,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
  assert.equal(res.headers['X-Cache'], undefined);
});

test('a cache hit short-circuits with X-Cache: HIT', async () => {
  const cache = memoryCache({ 'cache:http:/api/v1/campaigns': { data: [1] } });
  const res = makeRes();
  let nextCalled = false;
  await createCacheMiddleware({ cacheService: cache })(
    { method: 'GET', originalUrl: '/api/v1/campaigns' },
    res,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, false);
  assert.equal(res.headers['X-Cache'], 'HIT');
  assert.deepEqual(res.sent, { data: [1] });
});

test('a miss continues and caches a successful JSON response with the configured TTL and prefix', async () => {
  const cache = memoryCache();
  const res = makeRes(200);
  await createCacheMiddleware({ cacheService: cache, ttlSec: 15, keyPrefix: 'k' })(
    { method: 'GET', originalUrl: '/a?b=1' },
    res,
    () => {},
  );
  assert.equal(res.headers['X-Cache'], 'MISS');

  res.json({ ok: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(cache.sets, [{ key: 'k:/a?b=1', ttl: 15 }]);
  assert.deepEqual(res.sent, { ok: true });
});

test('error responses are not cached', async () => {
  const cache = memoryCache();
  const res = makeRes(500);
  await createCacheMiddleware({ cacheService: cache })(
    { method: 'GET', url: '/boom' },
    res,
    () => {},
  );
  res.json({ error: 'x' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cache.sets.length, 0);
});

test('cache backend failures never break the request', async () => {
  const broken = {
    get: async () => {
      throw new Error('redis down');
    },
    set: async () => {
      throw new Error('redis down');
    },
  };
  const res = makeRes(200);
  let nextCalled = false;
  await createCacheMiddleware({ cacheService: broken })(
    { method: 'GET', originalUrl: '/a' },
    res,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
  assert.equal(res.headers['X-Cache'], 'MISS');
  res.json({ ok: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(res.sent, { ok: 1 });
});
