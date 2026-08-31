// @ts-check
import pino from 'pino';
import { getRequestId } from '../lib/requestContext.js';

// Field paths redacted from every log line regardless of call site (#925 —
// no secret leakage). Covers the common ways a raw credential could end up
// in a log object: request headers, an attached auth/API-key object, or a
// conventionally-named secret field one level deep in any logged object.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'password',
  '*.password',
  'secret',
  '*.secret',
  'apiKey',
  '*.apiKey',
  'token',
  '*.token',
  'authorization',
  '*.authorization',
];

// Exported (not just used inline) so tests can build a byte-for-byte
// identical pino instance pointed at a capturable stream, to verify the
// mixin/redact behavior for real rather than mocking it away.
export const pinoOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  // Merged into every log line so requestId correlation (#925) is automatic
  // — no call site needs to remember to pass it.
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
};

export const log = pino(pinoOptions);

/**
 * Logs each request as a structured JSON line including method, path,
 * status code, duration ms, and request ID.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    // Read directly off res.locals rather than relying on the requestContext
    // mixin (#925) — this is the single most load-bearing log line in the
    // app, so it stays correct even if middleware ordering ever changes.
    log.info({
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
    });
  });

  next();
}
