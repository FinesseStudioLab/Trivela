import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { createSqliteIdempotencyRepository } from '../dal/sqliteIdempotencyRepository.js';
import { createIdempotencyMiddleware } from './idempotency.js';

describe('idempotency middleware', () => {
  let db;
  let repository;
  let middleware;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key               TEXT PRIMARY KEY,
        request_fingerprint TEXT NOT NULL,
        status_code       INTEGER NOT NULL,
        response_body     TEXT NOT NULL,
        locked_at         TEXT,
        completed_at      TEXT,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at        TEXT NOT NULL
      );
    `);
    repository = createSqliteIdempotencyRepository({ db });
    middleware = createIdempotencyMiddleware({ repository });
  });

  it('skips non-mutating methods', async () => {
    const req = { method: 'GET', headers: {} };
    const res = {};
    let called = false;
    await middleware(req, res, () => { called = true; });
    assert.ok(called);
  });

  it('skips when no idempotency key header', async () => {
    const req = { method: 'POST', headers: {}, body: {} };
    const res = {};
    let called = false;
    await middleware(req, res, () => { called = true; });
    assert.ok(called);
  });

  it('rejects invalid key format', async () => {
    const req = { method: 'POST', headers: { 'idempotency-key': 'short' }, body: {} };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    let called = false;
    await middleware(req, res, () => { called = true; });
    assert.ok(!called);
    assert.strictEqual(res.statusCode, 400);
  });

  it('processes first request and stores result', async () => {
    const req = { method: 'POST', headers: { 'idempotency-key': 'test-key-12345678' }, body: { data: 'test' }, originalUrl: '/test', log: null };
    const res = {
      statusCode: 201,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      setHeader() {},
    };
    let called = false;
    await middleware(req, res, () => { called = true; });
    assert.ok(called);

    res.json({ id: 1, name: 'test' });
    const stored = repository.find('test-key-12345678');
    assert.ok(stored);
    assert.strictEqual(stored.completed_at !== null, true);
  });

  it('replays stored response for duplicate key', async () => {
    const key = 'duplicate-key-12345678';
    repository.create(key, 'fingerprint1');
    repository.tryLock(key);
    repository.complete(key, 201, JSON.stringify({ id: 1 }));

    const req = { method: 'POST', headers: { 'idempotency-key': key }, body: { data: 'test' }, originalUrl: '/test', log: null };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      setHeader() {},
    };
    let called = false;
    await middleware(req, res, () => { called = true; });
    assert.ok(!called);
    assert.strictEqual(res.statusCode, 201);
    assert.deepStrictEqual(res.body, { id: 1 });
  });

  it('returns 409 for in-progress request', async () => {
    const key = 'progress-key-12345678';
    repository.create(key, 'fingerprint1');
    repository.tryLock(key);

    const req = { method: 'POST', headers: { 'idempotency-key': key }, body: { data: 'test' }, originalUrl: '/test', log: null };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      setHeader() {},
    };
    let called = false;
    await middleware(req, res, () => { called = true; });
    assert.ok(!called);
    assert.strictEqual(res.statusCode, 409);
  });

  it('returns 422 for mismatched payload', async () => {
    const key = 'mismatch-key-12345678';
    repository.create(key, 'fingerprint1');
    repository.tryLock(key);
    repository.complete(key, 200, JSON.stringify({ result: 'ok' }));

    const req = { method: 'POST', headers: { 'idempotency-key': key }, body: { data: 'different' }, originalUrl: '/test', log: null };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      setHeader() {},
    };
    let called = false;
    await middleware(req, res, () => { called = true; });
    assert.ok(!called);
    assert.strictEqual(res.statusCode, 422);
  });
});
