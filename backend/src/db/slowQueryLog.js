// @ts-check
import { log } from '../middleware/logger.js';

/** Queries at or above this duration (ms) are reported. */
export const DEFAULT_SLOW_QUERY_MS = 200;

/**
 * Parses a Sentry DSN into the pieces needed for the store endpoint.
 *
 * @param {string} dsn
 */
function parseSentryDsn(dsn) {
  try {
    const url = new URL(dsn);
    const publicKey = decodeURIComponent(url.username);
    const projectId = url.pathname.replace(/^\//, '');
    if (!publicKey || !projectId) return null;
    return {
      storeUrl: `${url.origin}/api/${projectId}/store/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

/**
 * @typedef {{ sql: string, durationMs: number, thresholdMs: number, detail?: string }} SlowQueryEvent
 */

/**
 * Creates a slow-query reporter that logs queries at or above the threshold
 * and fans the event out to configured sinks (Sentry, CloudWatch, …).
 *
 * The default log sink writes a structured JSON line, which is what the
 * CloudWatch agent ships from the backend's stdout.
 *
 * @param {{ thresholdMs?: number, sinks?: Array<(event: SlowQueryEvent) => void>, sentryDsn?: string }} [options]
 */
export function createSlowQueryReporter(options = {}) {
  const thresholdMs = options.thresholdMs ?? DEFAULT_SLOW_QUERY_MS;
  const sinks = [...(options.sinks ?? [])];

  const sentryDsn = options.sentryDsn ?? process.env.SENTRY_DSN ?? '';
  const sentry = sentryDsn ? parseSentryDsn(sentryDsn) : null;

  return {
    thresholdMs,
    /** @param {SlowQueryEvent} event */
    report(event) {
      if (event.durationMs < thresholdMs) return;

      log.warn({
        event: 'db.slow_query',
        sql: event.sql,
        duration_ms: event.durationMs,
        threshold_ms: thresholdMs,
        ...(event.detail ? { detail: event.detail } : {}),
      });

      if (sentry) {
        fetch(sentry.storeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${sentry.publicKey}`,
          },
          body: JSON.stringify({
            level: 'warning',
            logger: 'db.slow_query',
            message: `Slow query (${event.durationMs}ms ≥ ${thresholdMs}ms): ${event.sql.slice(0, 200)}`,
            tags: { duration_ms: String(event.durationMs), threshold_ms: String(thresholdMs) },
          }),
        }).catch(() => {
          // Telemetry must never break query execution.
        });
      }

      for (const sink of sinks) {
        try {
          sink(event);
        } catch {
          // Same guarantee as above.
        }
      }
    },
  };
}

/**
 * Times `fn` and reports when it runs slowly.
 *
 * @template T
 * @param {{ sql: string, detail?: string }} meta
 * @param {() => T} fn
 * @param {{ report: (event: SlowQueryEvent) => void }} reporter
 * @returns {T}
 */
export function timeSyncQuery(meta, fn, reporter) {
  const start = process.hrtime.bigint();
  try {
    return fn();
  } finally {
    reporter.report({
      sql: meta.sql,
      durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      ...(meta.detail ? { detail: meta.detail } : {}),
    });
  }
}

/**
 * Instruments a better-sqlite3 database so every prepared statement
 * execution is timed and slow ones are reported.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ thresholdMs?: number, sinks?: Array<(event: SlowQueryEvent) => void>, sentryDsn?: string }} [options]
 */
export function instrumentDatabase(db, options = {}) {
  const reporter = createSlowQueryReporter(options);
  const originalPrepare = db.prepare.bind(db);

  db.prepare = (sql) => {
    const stmt = originalPrepare(sql);
    for (const method of /** @type {const} */ (['get', 'all', 'run'])) {
      const original = stmt[method].bind(stmt);
      stmt[method] = (...args) =>
        timeSyncQuery({ sql, detail: method }, () => original(...args), reporter);
    }
    return stmt;
  };

  return reporter;
}
