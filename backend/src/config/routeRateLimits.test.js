import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRouteRateLimitResolver,
  DEFAULT_ROUTE_RATE_LIMITS,
  parseRouteRateLimits,
} from './routeRateLimits.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const req = (method, url, extra = {}) => ({
  method,
  originalUrl: url,
  headers: {},
  query: {},
  ip: '10.0.0.1',
  ...extra,
});

function run(limiter, request) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        resolve({ status: this.code, body, headers });
      },
    };
    limiter(request, res, () => resolve({ status: 200, headers }));
  });
}

test('resolver matches method + templated path, ignoring version prefix and query', () => {
  const resolve = createRouteRateLimitResolver(DEFAULT_ROUTE_RATE_LIMITS);
  assert.equal(resolve(req('POST', '/api/v1/campaigns/42/image?x=1'))?.maxRequests, 10);
  assert.equal(resolve(req('POST', '/api/campaigns'))?.maxRequests, 30);
  assert.equal(resolve(req('GET', '/api/v1/campaigns')), null);
  assert.equal(resolve(req('POST', '/api/v1/campaigns/42/other')), null);
});

test('parseRouteRateLimits drops invalid entries and rejects non-arrays', () => {
  const rules = parseRouteRateLimits(
    JSON.stringify([
      { method: 'POST', path: '/x', maxRequests: 5 },
      { method: 'POST', path: '/y', maxRequests: 0 },
      { path: '/z', maxRequests: 3 },
    ]),
  );
  assert.deepEqual(rules, [{ method: 'POST', path: '/x', maxRequests: 5 }]);
  assert.equal(parseRouteRateLimits('{"a":1}'), null);
  assert.equal(parseRouteRateLimits('not json'), null);
  assert.equal(parseRouteRateLimits(undefined), null);
});

test('a write route is throttled harder than reads, from its own bucket', async () => {
  const limiter = createRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    timeProvider: () => 1_000,
    resolveRouteLimit: createRouteRateLimitResolver([
      { method: 'POST', path: '/campaigns/:id/image', maxRequests: 2 },
    ]),
  });

  const upload = () => run(limiter, req('POST', '/api/v1/campaigns/1/image'));
  assert.equal((await upload()).status, 200);
  assert.equal((await upload()).status, 200);
  const blocked = await upload();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.limit, 2);
  assert.equal(blocked.headers['X-RateLimit-Limit'], '2');

  // Reads from the same client are unaffected and still use the global budget.
  const read = await run(limiter, req('GET', '/api/v1/campaigns'));
  assert.equal(read.status, 200);
  assert.equal(read.headers['X-RateLimit-Limit'], '100');
});

test('a route limit never loosens a stricter global/tier limit', async () => {
  const limiter = createRateLimiter({
    maxRequests: 1,
    windowMs: 60_000,
    timeProvider: () => 1_000,
    resolveRouteLimit: createRouteRateLimitResolver([
      { method: 'POST', path: '/campaigns', maxRequests: 50 },
    ]),
  });

  assert.equal((await run(limiter, req('POST', '/api/v1/campaigns'))).status, 200);
  assert.equal((await run(limiter, req('POST', '/api/v1/campaigns'))).status, 429);
});
