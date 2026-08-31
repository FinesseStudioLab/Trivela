// @ts-check
import { runWithRequestId } from '../lib/requestContext.js';

/**
 * Express adapter for `lib/requestContext.js`'s AsyncLocalStorage-based
 * correlation context (#925). Must be mounted immediately after `requestId`
 * (which sets `res.locals.requestId`) and before anything that logs.
 *
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requestContextMiddleware(_req, res, next) {
  runWithRequestId(res.locals.requestId, next);
}
