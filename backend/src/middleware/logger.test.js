// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import requestLogger, { log } from './logger.js';

function makeReqRes({ method = 'GET', path = '/health', ip = '127.0.0.1', userAgent = 'test-agent/1.0' } = {}) {
  const req = { method, path, ip, headers: { 'user-agent': userAgent }, socket: { remoteAddress: ip } };
  const res = /** @type {any} */ (new EventEmitter());
  Object.assign(res, { statusCode: 200, locals: { requestId: 'req_abc' } });
  return { req, res };
}

test('requestLogger emits a structured log on response finish with method, path, status, and duration_ms', () => {
  const captured = [];
  const originalInfo = log.info.bind(log);
  log.info = (payload) => { captured.push(payload); };

  try {
    const { req, res } = makeReqRes({ method: 'POST', path: '/api/v1/campaigns' });
    res.statusCode = 201;
    let nextCalled = false;

    requestLogger(/** @type {any} */ (req), /** @type {any} */ (res), () => { nextCalled = true; });

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
  log.info = (payload) => { captured.push(payload); };

  try {
    const { req, res } = makeReqRes();
    requestLogger(/** @type {any} */ (req), /** @type {any} */ (res), () => {});
    assert.equal(captured.length, 0, 'no log should be emitted until finish event fires');
  } finally {
    log.info = originalInfo;
  }
});

test('requestLogger logs ip and user_agent fields', () => {
  const captured = [];
  const originalInfo = log.info.bind(log);
  log.info = (payload) => { captured.push(payload); };

  try {
    const { req, res } = makeReqRes({ ip: '10.0.0.1', userAgent: 'Mozilla/5.0' });
    requestLogger(/** @type {any} */ (req), /** @type {any} */ (res), () => {});
    res.emit('finish');

    assert.equal(captured.length, 1);
    assert.equal(captured[0].ip, '10.0.0.1');
    assert.equal(captured[0].user_agent, 'Mozilla/5.0');
  } finally {
    log.info = originalInfo;
  }
});

test('requestLogger handles missing user-agent gracefully', () => {
  const captured = [];
  const originalInfo = log.info.bind(log);
  log.info = (payload) => { captured.push(payload); };

  try {
    const req = { method: 'GET', path: '/health', ip: '127.0.0.1', headers: {}, socket: {} };
    const res = /** @type {any} */ (new EventEmitter());
    Object.assign(res, { statusCode: 200, locals: { requestId: 'req_xyz' } });

    requestLogger(/** @type {any} */ (req), /** @type {any} */ (res), () => {});
    res.emit('finish');

    assert.equal(captured.length, 1);
    assert.equal(captured[0].user_agent, undefined);
  } finally {
    log.info = originalInfo;
  }
});

test('requestLogger logs 4xx and 5xx status codes correctly', () => {
  const captured = [];
  const originalInfo = log.info.bind(log);
  log.info = (payload) => { captured.push(payload); };

  try {
    const { req, res } = makeReqRes({ method: 'DELETE', path: '/api/v1/campaigns/999' });
    res.statusCode = 404;
    requestLogger(/** @type {any} */ (req), /** @type {any} */ (res), () => {});
    res.emit('finish');

    assert.equal(captured[0].status, 404);
    assert.equal(captured[0].method, 'DELETE');
    assert.equal(captured[0].path, '/api/v1/campaigns/999');
  } finally {
    log.info = originalInfo;
  }
});
