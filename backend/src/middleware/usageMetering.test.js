// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsageMeteringMiddleware } from './usageMetering.js';

/**
 * @param {{ orgId?: string | null; softLimit?: number | null; hardLimit?: number | null; count?: number }} [opts]
 */
function makeSetup({ orgId = 'org-1', softLimit = null, hardLimit = null, count = 1 } = {}) {
  const req = { auth: orgId ? { orgId } : null };
  const headers = {};
  const res = {
    statusCode: 200,
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    body: null,
  };

  const mockService = {
    async increment(_orgId, _resource) {
      return {
        count,
        softLimit,
        hardLimit,
        windowStart: '2024-01-01T00:00:00.000Z',
        windowSeconds: 3600,
      };
    },
    getOrgUsage() {
      return [];
    },
    adminExport() {
      return [];
    },
    flushToDb() {
      return Promise.resolve();
    },
    startFlushInterval() {
      return () => {};
    },
  };

  return { req, res, mockService };
}

// ── Pass-through when no orgId ─────────────────────────────────────────────

test('skips metering when req.auth is null', async () => {
  const { req, res, mockService } = makeSetup({ orgId: null });
  const mw = createUsageMeteringMiddleware({ usageMeteringService: mockService });
  let called = false;
  await mw(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(res.headers['X-Quota-Used'], undefined);
});

// ── Header injection ───────────────────────────────────────────────────────

test('sets X-Quota-Used header with the current count', async () => {
  const { req, res, mockService } = makeSetup({ count: 7 });
  const mw = createUsageMeteringMiddleware({ usageMeteringService: mockService });
  let called = false;
  await mw(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(res.headers['X-Quota-Used'], '7');
});

test('sets X-Quota-Limit header when hard limit is configured', async () => {
  const { req, res, mockService } = makeSetup({ hardLimit: 100, count: 5 });
  const mw = createUsageMeteringMiddleware({ usageMeteringService: mockService });
  await mw(req, res, () => {});
  assert.equal(res.headers['X-Quota-Limit'], '100');
});

test('sets X-Quota-Window header', async () => {
  const { req, res, mockService } = makeSetup({ count: 1 });
  const mw = createUsageMeteringMiddleware({ usageMeteringService: mockService });
  await mw(req, res, () => {});
  assert.equal(res.headers['X-Quota-Window'], '3600');
});

// ── Soft limit warning ─────────────────────────────────────────────────────

test('adds X-Quota-Warning when at soft limit', async () => {
  const { req, res, mockService } = makeSetup({ softLimit: 5, hardLimit: 10, count: 5 });
  const mw = createUsageMeteringMiddleware({ usageMeteringService: mockService });
  let called = false;
  await mw(req, res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.ok(res.headers['X-Quota-Warning'], 'expected X-Quota-Warning header');
});

test('no warning when below soft limit', async () => {
  const { req, res, mockService } = makeSetup({ softLimit: 10, hardLimit: 20, count: 3 });
  const mw = createUsageMeteringMiddleware({ usageMeteringService: mockService });
  await mw(req, res, () => {});
  assert.equal(res.headers['X-Quota-Warning'], undefined);
});

// ── Hard limit enforcement ─────────────────────────────────────────────────

test('returns 429 and blocks next() when hard limit exceeded', async () => {
  const { req, res, mockService } = makeSetup({ hardLimit: 10, count: 11 });
  const mw = createUsageMeteringMiddleware({ usageMeteringService: mockService });
  let called = false;
  await mw(req, res, () => {
    called = true;
  });
  assert.equal(called, false, 'next() must not be called after quota exceeded');
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, 'QUOTA_EXCEEDED');
  assert.equal(res.body.limit, 10);
  assert.equal(res.body.used, 11);
});

test('allows request when exactly at hard limit (not over)', async () => {
  const { req, res, mockService } = makeSetup({ hardLimit: 10, count: 10 });
  const mw = createUsageMeteringMiddleware({ usageMeteringService: mockService });
  let called = false;
  await mw(req, res, () => {
    called = true;
  });
  assert.equal(called, true, 'next() should be called when count == hardLimit');
  assert.equal(res.statusCode, 200);
});

// ── Resilience ─────────────────────────────────────────────────────────────

test('calls next() even when service.increment throws', async () => {
  const req = { auth: { orgId: 'org-1' } };
  const headers = {};
  const res = {
    statusCode: 200,
    headers,
    setHeader(n, v) {
      headers[n] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    body: null,
  };
  const failingService = {
    async increment() {
      throw new Error('Redis down');
    },
  };
  const mw = createUsageMeteringMiddleware({
    usageMeteringService: /** @type {any} */ (failingService),
  });
  let called = false;
  await mw(req, res, () => {
    called = true;
  });
  assert.equal(called, true, 'service failure must not block request');
});
