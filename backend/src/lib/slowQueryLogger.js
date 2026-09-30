/**
 * Slow database query detection (#1365).
 *
 * Wraps better-sqlite3 and pg query paths, timing each execution. Queries over
 * the threshold (default 200ms, SLOW_QUERY_THRESHOLD_MS) are reported to:
 *   - Sentry (captureMessage, when SENTRY_DSN is configured)
 *   - CloudWatch, via a CloudWatch Embedded Metric Format (EMF) line on stdout
 *     which the CloudWatch agent / awslogs driver turns into a metric.
 */

import { log } from '../middleware/logger.js';
import { captureMessage } from '../services/sentryIntegration.js';

export const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 200;
const MAX_SQL_LENGTH = 500;

export function getSlowQueryThresholdMs(env = process.env) {
  const raw = env.SLOW_QUERY_THRESHOLD_MS;
  if (raw === undefined || raw === '') return DEFAULT_SLOW_QUERY_THRESHOLD_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SLOW_QUERY_THRESHOLD_MS;
}

export function truncateSql(sql) {
  const text = typeof sql === 'string' ? sql.replace(/\s+/g, ' ').trim() : String(sql ?? '');
  return text.length > MAX_SQL_LENGTH ? `${text.slice(0, MAX_SQL_LENGTH)}…` : text;
}

/** CloudWatch EMF payload for a slow query. */
export function buildCloudWatchMetric({ durationMs, driver, namespace, timestamp = Date.now() }) {
  return {
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [['Driver']],
          Metrics: [{ Name: 'SlowQueryDurationMs', Unit: 'Milliseconds' }],
        },
      ],
    },
    Driver: driver,
    SlowQueryDurationMs: durationMs,
  };
}

const defaultReporters = {
  logger: log,
  sentry: captureMessage,
  cloudwatch: (payload) => process.stdout.write(`${JSON.stringify(payload)}\n`),
};

/**
 * Create a slow query monitor.
 * @param {{ thresholdMs?: number, driver?: string, reporters?: object, now?: () => number }} [opts]
 */
export function createSlowQueryMonitor({
  thresholdMs = getSlowQueryThresholdMs(),
  driver = 'sqlite',
  reporters = {},
  now = () => performance.now(),
} = {}) {
  const r = { ...defaultReporters, ...reporters };
  const namespace = process.env.CLOUDWATCH_NAMESPACE || 'Trivela/Database';

  function report(sql, durationMs) {
    const rounded = Math.round(durationMs * 100) / 100;
    const query = truncateSql(sql);
    // Each sink is isolated so monitoring can never break a query.
    try {
      r.logger.warn({ query, durationMs: rounded, thresholdMs, driver }, '[db] slow query');
    } catch { /* ignore */ }
    try {
      r.sentry(`Slow database query (${rounded}ms)`, 'warning', {
        query,
        durationMs: rounded,
        thresholdMs,
        driver,
      });
    } catch { /* ignore */ }
    try {
      r.cloudwatch(buildCloudWatchMetric({ durationMs: rounded, driver, namespace }));
    } catch { /* ignore */ }
  }

  /** Time a sync function; report if slow. Errors are timed too and rethrown. */
  function timeSync(sql, fn) {
    const start = now();
    try {
      return fn();
    } finally {
      const d = now() - start;
      if (d > thresholdMs) report(sql, d);
    }
  }

  async function timeAsync(sql, fn) {
    const start = now();
    try {
      return await fn();
    } finally {
      const d = now() - start;
      if (d > thresholdMs) report(sql, d);
    }
  }

  return { thresholdMs, report, timeSync, timeAsync };
}

const STATEMENT_METHODS = ['run', 'get', 'all', 'iterate'];

/**
 * Instrument a better-sqlite3 Database in place: prepare() statements and
 * exec() are timed. Idempotent. Returns the same db.
 */
export function instrumentSqlite(db, monitor = createSlowQueryMonitor({ driver: 'sqlite' })) {
  if (!db || db.__slowQueryInstrumented) return db;
  const origPrepare = db.prepare.bind(db);
  const origExec = db.exec.bind(db);

  db.prepare = (sql) => {
    const stmt = origPrepare(sql);
    for (const method of STATEMENT_METHODS) {
      if (typeof stmt[method] !== 'function') continue;
      const orig = stmt[method].bind(stmt);
      stmt[method] = (...args) => monitor.timeSync(sql, () => orig(...args));
    }
    return stmt;
  };
  db.exec = (sql) => monitor.timeSync(sql, () => origExec(sql));
  Object.defineProperty(db, '__slowQueryInstrumented', { value: true });
  return db;
}

/** Instrument a pg Pool/Client: query() is timed. Idempotent. */
export function instrumentPg(pool, monitor = createSlowQueryMonitor({ driver: 'postgres' })) {
  if (!pool || pool.__slowQueryInstrumented) return pool;
  const orig = pool.query.bind(pool);
  pool.query = (...args) => {
    const first = args[0];
    const sql = typeof first === 'string' ? first : first?.text;
    const result = monitor.timeAsync(sql, () => Promise.resolve(orig(...args)));
    return result;
  };
  Object.defineProperty(pool, '__slowQueryInstrumented', { value: true });
  return pool;
}
