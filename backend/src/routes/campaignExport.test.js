// @ts-check
/**
 * Unit tests for the campaign export route.
 * Run with: node --test src/routes/campaignExport.test.js
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignExportRoute } from './campaignExport.js';

// ── Fakes ─────────────────────────────────────────────────────────────────────

function makeDb(rows = [], { hasCreditEvents = true, hasClaimEvents = true } = {}) {
  return {
    prepare(sql) {
      if (sql.includes("sqlite_master") && sql.includes("credit_events")) {
        return { get: () => hasCreditEvents ? { name: 'credit_events' } : undefined };
      }
      if (sql.includes("sqlite_master") && sql.includes("claim_events")) {
        return { get: () => hasClaimEvents ? { name: 'claim_events' } : undefined };
      }
      return { all: (..._args) => rows, get: () => undefined };
    },
  };
}

function makeCampaignRepo(campaign = null) {
  return { getById: (id) => campaign ?? (id === 'camp1' ? { id: 'camp1', name: 'Test Campaign' } : null) };
}

function makeAuditRepo() {
  const calls = [];
  return {
    create: (entry) => calls.push(entry),
    calls,
  };
}

function makeRequireApiKey(req, res, next) {
  next();
}

function makeReq({ params = {}, query = {}, headers = {}, ip = '1.2.3.4' } = {}) {
  return { params, query, headers, ip, path: '/campaigns/' + (params.id ?? 'x') + '/export' };
}

function makeRes() {
  const res = {
    _status: 200,
    _headers: {},
    _body: null,
    status(code) { this._status = code; return this; },
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
    json(body) { this._body = body; return this; },
  };
  return res;
}

// Wraps pipeline streaming into a buffer we can assert against
function makeStreamRes() {
  const res = makeRes();
  const chunks = [];
  res.write = (chunk) => chunks.push(chunk);
  res.end = () => {};
  res.on = (event, cb) => { if (event === 'drain') {} };
  res.once = () => res;
  res.emit = () => false;
  res.writable = true;
  res.writableEnded = false;
  res.writableFinished = false;
  res._getBody = () => chunks.join('');
  return res;
}

async function callExport(handler, req, res) {
  return new Promise((resolve) => {
    handler(req, res, resolve);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRouter(opts = {}) {
  const db = opts.db ?? makeDb(opts.rows ?? []);
  const campaignRepository = opts.campaignRepo ?? makeCampaignRepo();
  const auditLogRepository = opts.auditRepo ?? makeAuditRepo();
  const requireApiKey = opts.requireApiKey ?? makeRequireApiKey;
  return createCampaignExportRoute({ db, campaignRepository, auditLogRepository, requireApiKey });
}

function routeHandler(router) {
  // Extract the GET handler from the Express router stack
  const layer = router.stack.find((l) => l.route?.path === '/campaigns/:id/export');
  if (!layer) throw new Error('Route not found');
  const handlers = layer.route.stack.map((s) => s.handle);
  return async (req, res) => {
    let i = 0;
    const next = () => { i++; if (i < handlers.length) return handlers[i](req, res, next); };
    return handlers[0](req, res, next);
  };
}

// ── Tests: validation ────────────────────────────────────────────────────────

describe('campaignExport — validation', () => {
  test('returns 400 for invalid format', async () => {
    const router = getRouter();
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: 'camp1' }, query: { format: 'xml' } });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res._status, 400);
    assert.equal(res._body?.code, 'INVALID_FORMAT');
  });

  test('returns 404 when campaign does not exist', async () => {
    const router = getRouter({ campaignRepo: { getById: () => null } });
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: 'nonexistent' }, query: { format: 'csv' } });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res._status, 404);
    assert.equal(res._body?.code, 'NOT_FOUND');
  });
});

// ── Tests: rate limiting ─────────────────────────────────────────────────────

describe('campaignExport — rate limiting', () => {
  test('sets X-RateLimit-Limit and X-RateLimit-Remaining headers', async () => {
    // Use a unique campaign ID to avoid state leakage from other tests
    const uniqueId = `rl-headers-${Date.now()}`;
    const router = getRouter({
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'RL Test' } : null },
    });
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'csv' }, headers: { 'x-api-key': 'key-rl-1' } });
    const res = makeRes();

    await handler(req, res);

    assert.equal(res._headers['x-ratelimit-limit'], '5');
    assert.ok(res._headers['x-ratelimit-remaining'] !== undefined);
  });

  test('returns 429 after exceeding 5 exports per campaign per actor', async () => {
    const uniqueId = `rl-throttle-${Date.now()}`;
    const router = getRouter({
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'RL Throttle' } : null },
    });
    const handler = routeHandler(router);

    // Exhaust 5 allowed exports
    for (let i = 0; i < 5; i++) {
      const req = makeReq({ params: { id: uniqueId }, query: { format: 'csv' }, headers: { 'x-api-key': 'key-rl-throttle' } });
      const res = makeRes();
      await handler(req, res);
    }

    // 6th should be rate-limited
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'csv' }, headers: { 'x-api-key': 'key-rl-throttle' } });
    const res = makeRes();
    await handler(req, res);

    assert.equal(res._status, 429);
    assert.equal(res._body?.code, 'EXPORT_RATE_LIMIT_EXCEEDED');
    assert.ok(res._headers['retry-after']);
  });

  test('different API keys have independent rate limit buckets', async () => {
    const uniqueId = `rl-keys-${Date.now()}`;
    const router = getRouter({
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'RL Keys' } : null },
    });
    const handler = routeHandler(router);

    // Exhaust key-A
    for (let i = 0; i < 5; i++) {
      const req = makeReq({ params: { id: uniqueId }, query: { format: 'csv' }, headers: { 'x-api-key': 'key-A-isolated' } });
      const res = makeRes();
      await handler(req, res);
    }

    // key-B should still be allowed
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'csv' }, headers: { 'x-api-key': 'key-B-isolated' } });
    const res = makeRes();
    await handler(req, res);

    assert.notEqual(res._status, 429);
  });
});

// ── Tests: CSV format ────────────────────────────────────────────────────────

describe('campaignExport — CSV format', () => {
  const PARTICIPANT_ROWS = [
    { participantAddress: 'GABC', registeredAt: '2026-01-01', pointsCredited: 100, pointsClaimed: 50, netPoints: 50, referredBy: 'GXYZ' },
    { participantAddress: 'GDEF', registeredAt: '2026-01-02', pointsCredited: 200, pointsClaimed: 0, netPoints: 200, referredBy: null },
  ];

  test('sets Content-Type text/csv and Content-Disposition attachment', async () => {
    const uniqueId = `csv-headers-${Date.now()}`;
    const router = getRouter({
      rows: PARTICIPANT_ROWS,
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'CSV' } : null },
    });
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'csv' }, headers: { 'x-api-key': `k-${uniqueId}` } });
    const res = makeRes();

    await handler(req, res);

    assert.ok(res._headers['content-type']?.includes('text/csv'));
    assert.ok(res._headers['content-disposition']?.includes('attachment'));
    assert.ok(res._headers['content-disposition']?.includes('.csv'));
  });

  test('CSV header row contains all required columns', async () => {
    const uniqueId = `csv-cols-${Date.now()}`;
    const auditRepo = makeAuditRepo();
    const router = getRouter({
      rows: PARTICIPANT_ROWS,
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'CSV Cols' } : null },
      auditRepo,
    });
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'csv' }, headers: { 'x-api-key': `k-${uniqueId}` } });

    // Capture streamed output by intercepting the underlying stream pipeline
    let csvBody = '';
    const res = {
      _status: 200,
      _headers: {},
      status(c) { this._status = c; return this; },
      setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
      json(b) { this._body = b; return this; },
      write(chunk) { csvBody += chunk; },
      end() {},
      on(e, cb) { return this; },
      once(e, cb) { return this; },
      emit() { return false; },
      writable: true,
      writableEnded: false,
      writableFinished: false,
      destroy() {},
    };

    await handler(req, res);

    const firstLine = csvBody.split('\n')[0] ?? '';
    assert.ok(firstLine.includes('participantAddress'), 'missing participantAddress');
    assert.ok(firstLine.includes('registeredAt'), 'missing registeredAt');
    assert.ok(firstLine.includes('pointsCredited'), 'missing pointsCredited');
    assert.ok(firstLine.includes('pointsClaimed'), 'missing pointsClaimed');
    assert.ok(firstLine.includes('netPoints'), 'missing netPoints');
    assert.ok(firstLine.includes('referredBy'), 'missing referredBy');
  });

  test('CSV escapes values containing commas', async () => {
    const { buildCsv } = await import('./campaignExport.js').catch(() => ({}));
    if (!buildCsv) return; // not exported — skip

    const columns = ['a', 'b'];
    const rows = [{ a: 'hello, world', b: 'normal' }];
    const csv = buildCsv(columns, rows);
    assert.ok(csv.includes('"hello, world"'));
  });
});

// ── Tests: JSON format ───────────────────────────────────────────────────────

describe('campaignExport — JSON format', () => {
  test('sets Content-Type application/json and Content-Disposition attachment', async () => {
    const uniqueId = `json-headers-${Date.now()}`;
    const router = getRouter({
      rows: [],
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'JSON Test' } : null },
    });
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'json' }, headers: { 'x-api-key': `k-${uniqueId}` } });

    let body = '';
    const res = {
      _status: 200,
      _headers: {},
      status(c) { this._status = c; return this; },
      setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
      json(b) { this._body = b; return this; },
      write(chunk) { body += chunk; },
      end() {},
      on() { return this; },
      once() { return this; },
      emit() { return false; },
      writable: true,
      writableEnded: false,
      writableFinished: false,
      destroy() {},
    };

    await handler(req, res);

    assert.ok(res._headers['content-type']?.includes('application/json'));
    assert.ok(res._headers['content-disposition']?.includes('attachment'));
    assert.ok(res._headers['content-disposition']?.includes('.json'));
  });

  test('JSON export includes campaign metadata and participants array', async () => {
    const uniqueId = `json-shape-${Date.now()}`;
    const router = getRouter({
      rows: [{ participantAddress: 'GABC', registeredAt: '2026-01-01', pointsCredited: 10, pointsClaimed: 0, netPoints: 10, referredBy: null }],
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'Shape Test' } : null },
    });
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'json' }, headers: { 'x-api-key': `k-${uniqueId}` } });

    let body = '';
    const res = {
      _status: 200,
      _headers: {},
      status(c) { this._status = c; return this; },
      setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
      json(b) { this._body = b; return this; },
      write(chunk) { body += chunk; },
      end() {},
      on() { return this; },
      once() { return this; },
      emit() { return false; },
      writable: true,
      writableEnded: false,
      writableFinished: false,
      destroy() {},
    };

    await handler(req, res);

    const parsed = JSON.parse(body);
    assert.ok('campaign' in parsed, 'missing campaign key');
    assert.ok('participants' in parsed, 'missing participants key');
    assert.ok(Array.isArray(parsed.participants));
    assert.equal(parsed.campaign.id, uniqueId);
    assert.equal(parsed.campaign.name, 'Shape Test');
  });
});

// ── Tests: date range filter ─────────────────────────────────────────────────

describe('campaignExport — date range filter', () => {
  test('accepts ?from and ?to without error when credit_events table is absent', async () => {
    const uniqueId = `date-filter-${Date.now()}`;
    const router = getRouter({
      rows: [],
      db: makeDb([], { hasCreditEvents: false }),
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'Date Test' } : null },
    });
    const handler = routeHandler(router);
    const req = makeReq({
      params: { id: uniqueId },
      query: { format: 'csv', from: '2026-01-01', to: '2026-06-01' },
      headers: { 'x-api-key': `k-${uniqueId}` },
    });

    let body = '';
    const res = {
      _status: 200,
      _headers: {},
      status(c) { this._status = c; return this; },
      setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
      json(b) { this._body = b; return this; },
      write(chunk) { body += chunk; },
      end() {},
      on() { return this; },
      once() { return this; },
      emit() { return false; },
      writable: true,
      writableEnded: false,
      writableFinished: false,
      destroy() {},
    };

    await handler(req, res);

    assert.notEqual(res._status, 400);
    assert.notEqual(res._status, 500);
  });
});

// ── Tests: audit log ─────────────────────────────────────────────────────────

describe('campaignExport — audit log', () => {
  test('creates an audit log entry on every successful export', async () => {
    const uniqueId = `audit-${Date.now()}`;
    const auditRepo = makeAuditRepo();
    const router = getRouter({
      rows: [],
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'Audit Test' } : null },
      auditRepo,
    });
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'csv' }, headers: { 'x-api-key': `k-audit-${uniqueId}` } });

    const res = {
      _status: 200,
      _headers: {},
      status(c) { this._status = c; return this; },
      setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
      json(b) { this._body = b; return this; },
      write() {},
      end() {},
      on() { return this; },
      once() { return this; },
      emit() { return false; },
      writable: true,
      writableEnded: false,
      writableFinished: false,
      destroy() {},
    };

    await handler(req, res);

    assert.equal(auditRepo.calls.length, 1);
    const entry = auditRepo.calls[0];
    assert.equal(entry.action, 'campaign.export');
    assert.equal(entry.entity, 'campaign');
    assert.equal(entry.entityId, uniqueId);
    assert.equal(entry.diff.format, 'csv');
  });

  test('does not fail if audit log throws', async () => {
    const uniqueId = `audit-fail-${Date.now()}`;
    const failingAuditRepo = { create: () => { throw new Error('audit DB down'); } };
    const router = getRouter({
      rows: [],
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'Audit Fail' } : null },
      auditRepo: failingAuditRepo,
    });
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'csv' }, headers: { 'x-api-key': `k-af-${uniqueId}` } });

    const res = {
      _status: 200,
      _headers: {},
      status(c) { this._status = c; return this; },
      setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
      json(b) { this._body = b; return this; },
      write() {},
      end() {},
      on() { return this; },
      once() { return this; },
      emit() { return false; },
      writable: true,
      writableEnded: false,
      writableFinished: false,
      destroy() {},
    };

    await assert.doesNotReject(() => handler(req, res));
  });
});

// ── Tests: referrals-only fallback ───────────────────────────────────────────

describe('campaignExport — referrals-only fallback', () => {
  test('falls back to referrals when credit_events table does not exist', async () => {
    const uniqueId = `fallback-${Date.now()}`;
    const referralRows = [
      { referee_address: 'GABC', referrer_address: 'GXYZ', created_at: '2026-01-01' },
    ];
    const router = getRouter({
      db: makeDb(referralRows, { hasCreditEvents: false }),
      campaignRepo: { getById: (id) => id === uniqueId ? { id: uniqueId, name: 'Fallback Test' } : null },
    });
    const handler = routeHandler(router);
    const req = makeReq({ params: { id: uniqueId }, query: { format: 'json' }, headers: { 'x-api-key': `k-fb-${uniqueId}` } });

    let body = '';
    const res = {
      _status: 200,
      _headers: {},
      status(c) { this._status = c; return this; },
      setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
      json(b) { this._body = b; return this; },
      write(chunk) { body += chunk; },
      end() {},
      on() { return this; },
      once() { return this; },
      emit() { return false; },
      writable: true,
      writableEnded: false,
      writableFinished: false,
      destroy() {},
    };

    await handler(req, res);

    const parsed = JSON.parse(body);
    assert.equal(parsed.participants.length, 1);
    assert.equal(parsed.participants[0].participantAddress, 'GABC');
    assert.equal(parsed.participants[0].referredBy, 'GXYZ');
    assert.equal(parsed.participants[0].pointsCredited, 0);
    assert.equal(parsed.participants[0].pointsClaimed, 0);
  });
});
