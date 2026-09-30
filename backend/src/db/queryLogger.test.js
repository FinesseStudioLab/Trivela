import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  DEFAULT_SLOW_QUERY_THRESHOLD_MS,
  getSlowQueryThresholdMs,
  sanitizeQueryParams,
  recordQueryExecution,
  wrapDatabaseWithQueryLogger,
  wrapPoolWithQueryLogger,
} from './queryLogger.js';

describe('queryLogger (Issue #1365)', () => {
  describe('getSlowQueryThresholdMs', () => {
    it('returns default 200ms when env is unset', () => {
      const originalEnv = process.env.SLOW_QUERY_THRESHOLD_MS;
      delete process.env.SLOW_QUERY_THRESHOLD_MS;
      assert.equal(getSlowQueryThresholdMs(), DEFAULT_SLOW_QUERY_THRESHOLD_MS);
      if (originalEnv) process.env.SLOW_QUERY_THRESHOLD_MS = originalEnv;
    });

    it('returns parsed integer when env is set', () => {
      const originalEnv = process.env.SLOW_QUERY_THRESHOLD_MS;
      process.env.SLOW_QUERY_THRESHOLD_MS = '150';
      assert.equal(getSlowQueryThresholdMs(), 150);
      if (originalEnv) process.env.SLOW_QUERY_THRESHOLD_MS = originalEnv;
      else delete process.env.SLOW_QUERY_THRESHOLD_MS;
    });
  });

  describe('sanitizeQueryParams', () => {
    it('redacts sensitive fields in params object', () => {
      const raw = {
        name: 'test-campaign',
        password: 'my-super-secret-password',
        apiKey: 'sk_live_123456789',
        nested: {
          token: 'jwt-bearer-token',
          safeField: 'hello',
        },
      };

      const sanitized = sanitizeQueryParams(raw);
      assert.equal(sanitized.name, 'test-campaign');
      assert.equal(sanitized.password, '[REDACTED]');
      assert.equal(sanitized.apiKey, '[REDACTED]');
      assert.equal(sanitized.nested.token, '[REDACTED]');
      assert.equal(sanitized.nested.safeField, 'hello');
    });

    it('handles arrays and primitives safely', () => {
      assert.equal(sanitizeQueryParams(null), null);
      assert.equal(sanitizeQueryParams('safe-string'), 'safe-string');
      assert.deepEqual(sanitizeQueryParams([1, 'two']), [1, 'two']);
    });
  });

  describe('recordQueryExecution', () => {
    it('does not log or alert when duration is under threshold', () => {
      const warnMock = mock.fn();
      const sentryMock = mock.fn();

      const result = recordQueryExecution({
        query: 'SELECT * FROM campaigns',
        durationMs: 50,
        thresholdMs: 200,
        logger: { warn: warnMock },
        sentryCapture: sentryMock,
      });

      assert.equal(result, false);
      assert.equal(warnMock.mock.calls.length, 0);
      assert.equal(sentryMock.mock.calls.length, 0);
    });

    it('logs to CloudWatch and Sentry when query is slow (>= threshold)', () => {
      const warnMock = mock.fn();
      const sentryMock = mock.fn();

      const result = recordQueryExecution({
        query: 'SELECT * FROM campaigns WHERE active = 1',
        durationMs: 250,
        params: { id: 'camp-1', secret: 'hide-me' },
        thresholdMs: 200,
        logger: { warn: warnMock },
        sentryCapture: sentryMock,
      });

      assert.equal(result, true);
      assert.equal(warnMock.mock.calls.length, 1);
      const [logPayload, logMessage] = warnMock.mock.calls[0].arguments;
      assert.equal(logMessage, 'Slow database query detected');
      assert.equal(logPayload.duration_ms, 250);
      assert.equal(logPayload.threshold_ms, 200);
      assert.equal(logPayload.params.secret, '[REDACTED]');
      assert.equal(logPayload.params.id, 'camp-1');

      assert.equal(sentryMock.mock.calls.length, 1);
      const [msg, level, context] = sentryMock.mock.calls[0].arguments;
      assert.match(msg, /Slow query detected: 250ms/);
      assert.equal(level, 'warning');
      assert.equal(context.slow_query.duration_ms, 250);
    });
  });

  describe('wrapDatabaseWithQueryLogger', () => {
    it('intercepts queries on better-sqlite3 instance', () => {
      const warnMock = mock.fn();
      const sentryMock = mock.fn();

      const rawDb = new Database(':memory:');
      const db = wrapDatabaseWithQueryLogger(rawDb, {
        thresholdMs: 0, // Force every query to be logged as slow for testing
        logger: { warn: warnMock },
        sentryCapture: sentryMock,
      });

      db.exec('CREATE TABLE test_items (id INTEGER PRIMARY KEY, title TEXT)');
      assert.equal(warnMock.mock.calls.length, 1);
      assert.match(warnMock.mock.calls[0].arguments[0].query, /CREATE TABLE test_items/);

      const insert = db.prepare('INSERT INTO test_items (title) VALUES (?)');
      insert.run('Item 1');
      assert.equal(warnMock.mock.calls.length, 2);

      const get = db.prepare('SELECT * FROM test_items WHERE id = ?');
      const item = get.get(1);
      assert.equal(item.title, 'Item 1');
      assert.equal(warnMock.mock.calls.length, 3);

      const all = db.prepare('SELECT * FROM test_items');
      const items = all.all();
      assert.equal(items.length, 1);
      assert.equal(warnMock.mock.calls.length, 4);

      // Verify idempotency of wrapping
      const rewrapped = wrapDatabaseWithQueryLogger(db);
      assert.equal(rewrapped, db);
    });
  });

  describe('wrapPoolWithQueryLogger', () => {
    it('intercepts pg pool queries', async () => {
      const warnMock = mock.fn();
      const sentryMock = mock.fn();

      const mockPool = {
        query: mock.fn(async (sql, params) => ({ rows: [{ id: 1 }] })),
      };

      const pool = wrapPoolWithQueryLogger(mockPool, {
        thresholdMs: 0,
        logger: { warn: warnMock },
        sentryCapture: sentryMock,
      });

      const res = await pool.query('SELECT 1', [42]);
      assert.deepEqual(res.rows, [{ id: 1 }]);
      assert.equal(warnMock.mock.calls.length, 1);
      assert.equal(warnMock.mock.calls[0].arguments[0].query, 'SELECT 1');
      assert.deepEqual(warnMock.mock.calls[0].arguments[0].params, [42]);
    });
  });
});
