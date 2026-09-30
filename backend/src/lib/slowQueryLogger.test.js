import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  createSlowQueryMonitor,
  getSlowQueryThresholdMs,
  instrumentSqlite,
  instrumentPg,
  truncateSql,
  buildCloudWatchMetric,
} from './slowQueryLogger.js';

function makeMonitor(clock, thresholdMs = 200) {
  const calls = { logger: [], sentry: [], cloudwatch: [] };
  const monitor = createSlowQueryMonitor({
    thresholdMs,
    now: () => clock.t,
    reporters: {
      logger: { warn: (...a) => calls.logger.push(a) },
      sentry: (...a) => calls.sentry.push(a),
      cloudwatch: (p) => calls.cloudwatch.push(p),
    },
  });
  return { monitor, calls };
}

test('threshold defaults to 200 and honours env', () => {
  assert.equal(getSlowQueryThresholdMs({}), 200);
  assert.equal(getSlowQueryThresholdMs({ SLOW_QUERY_THRESHOLD_MS: '50' }), 50);
  assert.equal(getSlowQueryThresholdMs({ SLOW_QUERY_THRESHOLD_MS: 'abc' }), 200);
  assert.equal(getSlowQueryThresholdMs({ SLOW_QUERY_THRESHOLD_MS: '-1' }), 200);
});

test('fast queries are not reported; slow ones go to all sinks', () => {
  const clock = { t: 0 };
  const { monitor, calls } = makeMonitor(clock);
  monitor.timeSync('SELECT 1', () => { clock.t += 200; });
  assert.equal(calls.sentry.length, 0);
  assert.equal(monitor.timeSync('SELECT 2', () => { clock.t += 250; return 'ok'; }), 'ok');
  assert.equal(calls.logger.length, 1);
  assert.equal(calls.sentry.length, 1);
  assert.equal(calls.cloudwatch[0].SlowQueryDurationMs, 250);
  assert.equal(calls.cloudwatch[0]._aws.CloudWatchMetrics[0].Metrics[0].Name, 'SlowQueryDurationMs');
});

test('slow failing query is reported and error rethrown', () => {
  const clock = { t: 0 };
  const { monitor, calls } = makeMonitor(clock);
  assert.throws(() => monitor.timeSync('BAD', () => { clock.t += 300; throw new Error('boom'); }), /boom/);
  assert.equal(calls.sentry.length, 1);
});

test('reporter failures never break the query', () => {
  const clock = { t: 0 };
  const monitor = createSlowQueryMonitor({
    thresholdMs: 10,
    now: () => clock.t,
    reporters: {
      logger: { warn: () => { throw new Error('x'); } },
      sentry: () => { throw new Error('x'); },
      cloudwatch: () => { throw new Error('x'); },
    },
  });
  assert.equal(monitor.timeSync('q', () => { clock.t += 50; return 7; }), 7);
});

test('truncateSql collapses whitespace and caps length', () => {
  assert.equal(truncateSql('SELECT  *\n FROM t'), 'SELECT * FROM t');
  assert.ok(truncateSql('x'.repeat(1000)).length <= 501);
});

test('buildCloudWatchMetric produces EMF', () => {
  const m = buildCloudWatchMetric({ durationMs: 5, driver: 'sqlite', namespace: 'NS', timestamp: 1 });
  assert.equal(m._aws.CloudWatchMetrics[0].Namespace, 'NS');
  assert.equal(m.Driver, 'sqlite');
});

test('instrumentSqlite times statements and exec, is idempotent', () => {
  const clock = { t: 0 };
  const { monitor, calls } = makeMonitor(clock, 0);
  const db = new Database(':memory:');
  instrumentSqlite(db, monitor);
  instrumentSqlite(db, monitor);
  db.exec('CREATE TABLE t (id INTEGER)');
  const before = calls.sentry.length;
  clock.t = 0;
  const stmt = db.prepare('INSERT INTO t (id) VALUES (?)');
  const tick = monitor.timeSync; // ensure clock advances between calls
  monitor.timeSync = (sql, fn) => { clock.t += 1; return tick(sql, () => { const r = fn(); clock.t += 5; return r; }); };
  stmt.run(1);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM t').get().c, 1);
  assert.ok(calls.sentry.length > before);
});

test('instrumentPg times async queries and propagates results/errors', async () => {
  const clock = { t: 0 };
  const { monitor, calls } = makeMonitor(clock);
  const pool = {
    query: async (q) => {
      clock.t += 400;
      if (q === 'bad') throw new Error('pg fail');
      return { rows: [1] };
    },
  };
  instrumentPg(pool, monitor);
  assert.deepEqual(await pool.query('SELECT 1'), { rows: [1] });
  await assert.rejects(pool.query('bad'), /pg fail/);
  assert.equal(calls.sentry.length, 2);
});
