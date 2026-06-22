// @ts-check
import pino from 'pino';

export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

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
