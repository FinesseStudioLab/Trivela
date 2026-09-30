// @ts-check
import { log as defaultLogger } from '../middleware/logger.js';
import { captureMessage as defaultCaptureMessage } from '../services/sentryIntegration.js';

export const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 200;

/**
 * Get configured threshold in ms from environment or default (200ms).
 * @returns {number}
 */
export function getSlowQueryThresholdMs() {
  const envVal = process.env.SLOW_QUERY_THRESHOLD_MS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_SLOW_QUERY_THRESHOLD_MS;
}

/**
 * Sanitize query parameters before logging to prevent sensitive data leakage.
 * @param {unknown} params
 * @returns {unknown}
 */
export function sanitizeQueryParams(params) {
  if (params === null || params === undefined) return params;
  if (typeof params !== 'object') return params;

  if (Array.isArray(params)) {
    return params.map((item) => sanitizeQueryParams(item));
  }

  const sanitized = {};
  const sensitiveRegex = /password|secret|token|apikey|key|auth|credential/i;

  for (const [key, value] of Object.entries(params)) {
    if (sensitiveRegex.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeQueryParams(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Record query execution time and alert if it exceeds threshold.
 *
 * @param {Object} options
 * @param {string} options.query - SQL query string
 * @param {number} options.durationMs - Execution duration in milliseconds
 * @param {unknown} [options.params] - Bound parameters
 * @param {number} [options.thresholdMs] - Threshold override
 * @param {Object} [options.logger] - Logger instance
 * @param {Function} [options.sentryCapture] - Sentry message capture function
 * @returns {boolean} true if query was slow and logged
 */
export function recordQueryExecution({
  query,
  durationMs,
  params = null,
  thresholdMs = getSlowQueryThresholdMs(),
  logger = defaultLogger,
  sentryCapture = defaultCaptureMessage,
}) {
  if (durationMs < thresholdMs) {
    return false;
  }

  const sanitizedParams = sanitizeQueryParams(params);
  const logPayload = {
    query: query?.trim(),
    duration_ms: durationMs,
    threshold_ms: thresholdMs,
    params: sanitizedParams,
  };

  // Log to CloudWatch via structured JSON log
  if (typeof logger?.warn === 'function') {
    logger.warn(logPayload, 'Slow database query detected');
  }

  // Log to Sentry
  if (typeof sentryCapture === 'function') {
    const querySummary = (query || 'UNKNOWN').trim().replace(/\s+/g, ' ').slice(0, 120);
    sentryCapture(
      `Slow query detected: ${durationMs}ms - ${querySummary}`,
      'warning',
      { slow_query: logPayload },
    );
  }

  return true;
}

/**
 * Wraps a better-sqlite3 Database instance to intercept and measure query executions.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Object} [options]
 * @param {number} [options.thresholdMs]
 * @param {Object} [options.logger]
 * @param {Function} [options.sentryCapture]
 * @returns {import('better-sqlite3').Database}
 */
export function wrapDatabaseWithQueryLogger(db, options = {}) {
  if (!db || typeof db.prepare !== 'function') {
    return db;
  }

  // Prevent double-wrapping
  if (db.__queryLoggerWrapped) {
    return db;
  }

  const originalPrepare = db.prepare.bind(db);
  const originalExec = db.exec.bind(db);

  db.prepare = function prepareWithTiming(sql) {
    const stmt = originalPrepare(sql);

    const wrapMethod = (methodName) => {
      const originalMethod = stmt[methodName].bind(stmt);
      stmt[methodName] = function timedStatementExecution(...args) {
        const start = performance.now();
        try {
          return originalMethod(...args);
        } finally {
          const durationMs = Math.round(performance.now() - start);
          recordQueryExecution({
            query: sql,
            durationMs,
            params: args.length > 0 ? args : null,
            ...options,
          });
        }
      };
    };

    if (typeof stmt.run === 'function') wrapMethod('run');
    if (typeof stmt.get === 'function') wrapMethod('get');
    if (typeof stmt.all === 'function') wrapMethod('all');

    return stmt;
  };

  db.exec = function execWithTiming(sql) {
    const start = performance.now();
    try {
      return originalExec(sql);
    } finally {
      const durationMs = Math.round(performance.now() - start);
      recordQueryExecution({
        query: sql,
        durationMs,
        ...options,
      });
    }
  };

  db.__queryLoggerWrapped = true;
  return db;
}

/**
 * Wraps a pg.Pool or pg.Client instance to intercept and measure query executions.
 *
 * @param {Object} pool - node-postgres Pool or Client
 * @param {Object} [options]
 * @param {number} [options.thresholdMs]
 * @param {Object} [options.logger]
 * @param {Function} [options.sentryCapture]
 * @returns {Object}
 */
export function wrapPoolWithQueryLogger(pool, options = {}) {
  if (!pool || typeof pool.query !== 'function') {
    return pool;
  }

  if (pool.__queryLoggerWrapped) {
    return pool;
  }

  const originalQuery = pool.query.bind(pool);

  pool.query = async function queryWithTiming(...args) {
    const start = performance.now();
    const query = typeof args[0] === 'string' ? args[0] : args[0]?.text;
    const params = Array.isArray(args[1]) ? args[1] : args[0]?.values;

    try {
      return await originalQuery(...args);
    } finally {
      const durationMs = Math.round(performance.now() - start);
      recordQueryExecution({
        query: query || 'UNKNOWN',
        durationMs,
        params,
        ...options,
      });
    }
  };

  pool.__queryLoggerWrapped = true;
  return pool;
}
