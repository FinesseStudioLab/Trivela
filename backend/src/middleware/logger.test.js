// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import pino from 'pino';
import requestLogger, { log, pinoOptions } from './logger.js';
import { runWithRequestId } from '../lib/requestContext.js';

/**
 * Builds a pino instance from the app's real `pinoOptions` (#925), piped
 * into an in-memory stream, so mixin/redact behavior is exercised for real
 * rather than mocked away like the requestLogger tests above do.
 */
function makeCapturingLogger() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  return { instance: pino(pinoOptions, stream), lines };
}

function makeReqRes({ method = 'GET', path = '/health' } = {}) {
  const req = { method, path };
  const res = /** @type {any} */ (new EventEmitter());
  Object.assign(res, { statusCode: 200, locals: { requestId: 'req_abc' } });
  return { req, res };
}

test('requestLogger emits a structured log on response finish with method, path, status, and duration_ms', () => {
  const captured = [];
  const originalInfo = log.info.bind(log);
  log.info = (payload) => {
    captured.push(payload);
  };

  try {
    const { req, res } = makeReqRes({ method: 'POST', path: '/api/v1/campaigns' });
    res.statusCode = 201;
    let nextCalled = false;

    requestLogger(/** @type {any} */ (req), /** @type {any} */ (res), () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, 'next() must be invoked synchronously');
    res.emit('finish');

    assert.equal(captured.length, 1, 'expected exactly one log entry per request');
    const entry = captured[0];
    assert.equal(entry.method, 'POST');
    assert.equal(entry.path, '/api/v1/campaigns');
    assert.equal(entry.status, 201);
    assert.equal(typeof entry.duration_ms, 'number');
    assert.ok(entry.duration_ms >= 0, 'duration_ms must be non-negative');
    assert.equal(entry.requestId, 'req_abc');
  } finally {
    log.info = originalInfo;
  }
});

test('requestLogger does not log before response finishes', () => {
  const captured = [];
  const originalInfo = log.info.bind(log);
  log.info = (payload) => {
    captured.push(payload);
  };

  try {
    const { req, res } = makeReqRes();
    requestLogger(/** @type {any} */ (req), /** @type {any} */ (res), () => {});
    assert.equal(captured.length, 0, 'no log should be emitted until finish event fires');
  } finally {
    log.info = originalInfo;
  }
});

// ── mixin: automatic requestId correlation (#925) ───────────────────────────

test('pino mixin injects requestId automatically when inside a tracked context', () => {
  const { instance, lines } = makeCapturingLogger();

  runWithRequestId('req-mixin-test', () => {
    instance.info({ foo: 'bar' }, 'hello');
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].requestId, 'req-mixin-test');
  assert.equal(lines[0].foo, 'bar');
  assert.equal(lines[0].msg, 'hello');
});

test('pino mixin omits requestId when logging outside any tracked context', () => {
  const { instance, lines } = makeCapturingLogger();

  instance.info('no context here');

  assert.equal(lines.length, 1);
  assert.equal('requestId' in lines[0], false);
});

test('an explicit requestId field on the log call is not overwritten by the mixin', () => {
  const { instance, lines } = makeCapturingLogger();

  runWithRequestId('from-mixin', () => {
    instance.info({ requestId: 'explicit-value' }, 'explicit wins');
  });

  assert.equal(lines[0].requestId, 'explicit-value');
});

// ── redact: no secret leakage (#925) ────────────────────────────────────────

test('redacts a raw API key logged under a conventional field name', () => {
  const { instance, lines } = makeCapturingLogger();

  instance.info({ apiKey: 'tk_super_secret_value' }, 'accidental key log');

  assert.equal(lines[0].apiKey, '[REDACTED]');
});

test('redacts req.headers.authorization and the x-api-key header', () => {
  const { instance, lines } = makeCapturingLogger();

  instance.info(
    { req: { headers: { authorization: 'Bearer secret-token', 'x-api-key': 'tk_abc' } } },
    'incoming request',
  );

  assert.equal(lines[0].req.headers.authorization, '[REDACTED]');
  assert.equal(lines[0].req.headers['x-api-key'], '[REDACTED]');
});

test('redacts password/secret/token fields nested one level deep', () => {
  const { instance, lines } = makeCapturingLogger();

  instance.info(
    { user: { password: 'hunter2' }, webhook: { secret: 'whsec_x' }, auth: { token: 'abc' } },
    'nested secrets',
  );

  assert.equal(lines[0].user.password, '[REDACTED]');
  assert.equal(lines[0].webhook.secret, '[REDACTED]');
  assert.equal(lines[0].auth.token, '[REDACTED]');
});

test('does not redact unrelated fields', () => {
  const { instance, lines } = makeCapturingLogger();

  instance.info({ campaignId: '123', status: 'active' }, 'normal log');

  assert.equal(lines[0].campaignId, '123');
  assert.equal(lines[0].status, 'active');
});
