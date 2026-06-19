// @ts-check
import { log } from './logger.js';
import { sanitizeObject, sanitizeForLog } from '../lib/sanitizer.js';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Central Express error handler. Catches errors passed to next(err) or thrown
 * inside async route handlers. Returns consistent JSON and hides stack traces
 * in production. Sanitizes error details to prevent log injection and
 * sensitive data leakage.
 *
 * @param {unknown} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export default function errorHandler(err, _req, res, _next) {
  const statusCode =
    err != null &&
    typeof err === 'object' &&
    'statusCode' in err &&
    typeof err.statusCode === 'number'
      ? err.statusCode
      : 500;

  const message = err instanceof Error ? err.message : 'An unexpected error occurred';

  // Sanitize error object for logging to prevent log injection
  const sanitizedErr =
    err instanceof Error
      ? {
          message: sanitizeForLog(err.message),
          name: sanitizeForLog(err.name),
        }
      : sanitizeObject(err);

  log.error({ err: sanitizedErr, requestId: res.locals.requestId }, 'Unhandled error');

  /** @type {Record<string, unknown>} */
  const body = {
    error: isProd ? 'An unexpected error occurred' : message,
    code: 'INTERNAL_SERVER_ERROR',
  };

  if (!isProd && err instanceof Error && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}
