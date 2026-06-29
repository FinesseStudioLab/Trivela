// @ts-check
/**
 * Unit tests for the deprecation notice middleware.
 * Run with: node --test src/middleware/deprecationNotice.test.js
 */

import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDeprecationMiddleware } from './deprecationNotice.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReqRes({ method = 'GET', path = '/api/v1/campaigns' } = {}) {
  const req = { method, path };
  const headers = {};
  const res = {
    setHeader(k, v) {
      headers[k] = v;
    },
    getHeaders: () => headers,
    _headers: headers,
  };
  return { req, res, headers };
}

function makeLogger() {
  const warns = [];
  return {
    warn: (...args) => warns.push(args.join(' ')),
    warns,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createDeprecationMiddleware', () => {
  test('calls next() even when no deprecation matches', (_, done) => {
    const mw = createDeprecationMiddleware({});
    const { req, res } = makeReqRes({ path: '/api/v1/campaigns' });
    mw(req, res, () => done());
  });

  test('does not set headers when route is not deprecated', () => {
    const mw = createDeprecationMiddleware({});
    const { req, res, headers } = makeReqRes({ path: '/api/v1/campaigns' });
    mw(req, res, () => {});
    assert.ok(!headers['Deprecation'], 'should not set Deprecation header');
    assert.ok(!headers['Sunset'], 'should not set Sunset header');
    assert.ok(!headers['Link'], 'should not set Link header');
  });

  test('sets Deprecation, Sunset, and Link headers for a registered route', () => {
    const registry = {
      'GET /api/campaigns': {
        deprecatedAt: '2026-01-01',
        removedAt: '2026-12-31',
        replacement: '/api/v1/campaigns',
        message: 'Use /api/v1/campaigns instead.',
      },
    };
    const mw = createDeprecationMiddleware({ registry });
    const { req, res, headers } = makeReqRes({ method: 'GET', path: '/api/campaigns' });
    mw(req, res, () => {});
    assert.ok(headers['Deprecation'], 'missing Deprecation header');
    assert.ok(headers['Sunset'], 'missing Sunset header');
    assert.ok(headers['Link'], 'missing Link header');
    assert.ok(headers['Link'].includes('/api/v1/campaigns'), 'Link should point to replacement');
  });

  test('matches parameterized segments — /api/campaigns/:id', () => {
    const registry = {
      'GET /api/campaigns/:id': {
        deprecatedAt: '2026-01-01',
        removedAt: '2026-12-31',
        replacement: '/api/v1/campaigns/:id',
        message: 'Use /api/v1/campaigns/:id instead.',
      },
    };
    const mw = createDeprecationMiddleware({ registry });
    const { req, res, headers } = makeReqRes({ method: 'GET', path: '/api/campaigns/abc123' });
    mw(req, res, () => {});
    assert.ok(headers['Deprecation'], 'parameterized path should match');
  });

  test('does not match wrong HTTP method', () => {
    const registry = {
      'GET /api/campaigns': {
        deprecatedAt: '2026-01-01',
        removedAt: '2026-12-31',
        replacement: '/api/v1/campaigns',
        message: '',
      },
    };
    const mw = createDeprecationMiddleware({ registry });
    const { req, res, headers } = makeReqRes({ method: 'POST', path: '/api/campaigns' });
    mw(req, res, () => {});
    assert.ok(!headers['Deprecation'], 'should not match a different HTTP method');
  });

  test('does not match a path with a different segment count', () => {
    const registry = {
      'GET /api/campaigns': {
        deprecatedAt: '2026-01-01',
        removedAt: '2026-12-31',
        replacement: '/api/v1/campaigns',
        message: '',
      },
    };
    const mw = createDeprecationMiddleware({ registry });
    const { req, res, headers } = makeReqRes({
      method: 'GET',
      path: '/api/campaigns/extra/segment',
    });
    mw(req, res, () => {});
    assert.ok(!headers['Deprecation'], 'should not match paths with extra segments');
  });

  test('WARN-logs on deprecated endpoint hit', () => {
    const registry = {
      'GET /api/campaigns': {
        deprecatedAt: '2026-01-01',
        removedAt: '2026-12-31',
        replacement: '/api/v1/campaigns',
        message: 'Legacy route.',
      },
    };
    const log = makeLogger();
    const mw = createDeprecationMiddleware({ log, registry });
    const { req, res } = makeReqRes({ method: 'GET', path: '/api/campaigns' });
    mw(req, res, () => {});
    assert.equal(log.warns.length, 1);
    assert.ok(log.warns[0].includes('deprecated_endpoint_hit'));
    assert.ok(log.warns[0].includes('/api/campaigns'));
  });

  test('does not WARN-log for non-deprecated routes', () => {
    const log = makeLogger();
    const mw = createDeprecationMiddleware({ log, registry: {} });
    const { req, res } = makeReqRes({ path: '/api/v1/campaigns' });
    mw(req, res, () => {});
    assert.equal(log.warns.length, 0);
  });

  test('Deprecation header value is a valid HTTP date string', () => {
    const registry = {
      'GET /api/campaigns': {
        deprecatedAt: '2026-01-01',
        removedAt: '2026-12-31',
        replacement: '/api/v1/campaigns',
        message: '',
      },
    };
    const mw = createDeprecationMiddleware({ registry });
    const { req, res, headers } = makeReqRes({ method: 'GET', path: '/api/campaigns' });
    mw(req, res, () => {});
    assert.ok(
      !isNaN(Date.parse(headers['Deprecation'])),
      'Deprecation header should be a parseable date',
    );
  });

  test('handles an empty registry without errors', () => {
    const mw = createDeprecationMiddleware({ registry: {} });
    const { req, res } = makeReqRes({ path: '/api/v1/anything' });
    assert.doesNotThrow(() => mw(req, res, () => {}));
  });
});
