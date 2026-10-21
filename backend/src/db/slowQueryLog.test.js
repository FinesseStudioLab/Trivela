// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  DEFAULT_SLOW_QUERY_MS,
  createSlowQueryReporter,
  instrumentDatabase,
  timeSyncQuery,
} from './slowQueryLog.js';

test('reporter ignores queries below the threshold', () => {
  /** @type {any[]} */
  const events = [];
  const reporter = createSlowQueryReporter({ thresholdMs: 200, sinks: [events.push.bind(events)] });

  reporter.report({ sql: 'SELECT 1', durationMs: 50 });

  assert.equal(events.length, 0, 'sub-threshold queries must not be reported');
});

test('reporter emits slow queries to every sink', () => {
  /** @type {any[]} */
  const a = [];
  /** @type {any[]} */
  const b = [];
  const reporter = createSlowQueryReporter({ thresholdMs: 200, sinks: [a.push.bind(a), b.push.bind(b)] });

  reporter.report({ sql: 'SELECT * FROM campaigns', durationMs: 250, detail: 'get' });

  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].sql, 'SELECT * FROM campaigns');
  assert.equal(a[0].durationMs, 250);
  assert.equal(a[0].detail, 'get');
});

test('reporter threshold is configurable and defaults to 200ms', () => {
  assert.equal(DEFAULT_SLOW_QUERY_MS, 200);
  assert.equal(createSlowQueryReporter().thresholdMs, 200);
  assert.equal(createSlowQueryReporter({ thresholdMs: 50 }).thresholdMs, 50);
});

test('a throwing sink does not break reporting', () => {
  /** @type {any[]} */
  const events = [];
  const reporter = createSlowQueryReporter({
    thresholdMs: 1,
    sinks: [
      () => {
        throw new Error('sink exploded');
      },
      events.push.bind(events),
    ],
  });

  reporter.report({ sql: 'SELECT 1', durationMs: 10 });

  assert.equal(events.length, 1, 'later sinks must still receive the event');
});

test('timeSyncQuery reports only slow executions', () => {
  /** @type {any[]} */
  const events = [];
  const reporter = createSlowQueryReporter({ thresholdMs: 0.0001, sinks: [events.push.bind(events)] });

  const result = timeSyncQuery({ sql: 'SELECT 42', detail: 'get' }, () => 42, reporter);

  assert.equal(result, 42);
  assert.equal(events.length, 1);
  assert.equal(events[0].sql, 'SELECT 42');
  assert.ok(events[0].durationMs >= 0, 'durationMs must be non-negative');
});

test('timeSyncQuery reports even when the query throws', () => {
  /** @type {any[]} */
  const events = [];
  const reporter = createSlowQueryReporter({ thresholdMs: 0, sinks: [events.push.bind(events)] });

  assert.throws(() =>
    timeSyncQuery({ sql: 'SELECT bad' }, () => {
      throw new Error('boom');
    }, reporter),
  );
  assert.equal(events.length, 1, 'failed slow queries must still be reported');
});

test('instrumentDatabase times prepared statement methods', () => {
  /** @type {any[]} */
  const events = [];
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');

  instrumentDatabase(db, { thresholdMs: 0, sinks: [events.push.bind(events)] });

  db.prepare('INSERT INTO t (name) VALUES (?)').run('alpha');
  db.prepare('SELECT * FROM t').all();
  db.prepare('SELECT * FROM t WHERE id = ?').get(1);

  const sqls = events.map((e) => e.sql);
  assert.ok(sqls.includes('INSERT INTO t (name) VALUES (?)'));
  assert.ok(sqls.includes('SELECT * FROM t'));
  assert.ok(sqls.includes('SELECT * FROM t WHERE id = ?'));
  assert.equal(events.length, 3, 'each statement execution must be timed');

  db.close();
});

test('instrumentDatabase still returns correct query results', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');

  instrumentDatabase(db, { thresholdMs: 10_000 });

  db.prepare('INSERT INTO t (name) VALUES (?)').run('alpha');
  const rows = db.prepare('SELECT name FROM t').all();
  const row = db.prepare('SELECT name FROM t WHERE id = ?').get(1);

  assert.deepEqual(rows, [{ name: 'alpha' }]);
  assert.deepEqual(row, { name: 'alpha' });

  db.close();
});
