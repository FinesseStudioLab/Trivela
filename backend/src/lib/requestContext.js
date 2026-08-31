// @ts-check
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Request/job-scoped context propagated implicitly through async call
 * chains (#925 — structured logging with correlation IDs). Framework-
 * agnostic on purpose: jobs and outbound RPC calls need it just as much as
 * HTTP request handling does, so it lives in `lib/`, not `middleware/`.
 *
 * Populated once per HTTP request (see `middleware/requestContext.js`) and
 * once per background-job execution (`runWithRequestId`, called from
 * `jobRunner.js` / `durableJobQueue.js`). Any code running inside that
 * scope — services, DAL, RPC calls, however many layers deep — can read the
 * current correlation ID via `getRequestId()` with no explicit parameter
 * threading. `middleware/logger.js`'s pino `mixin` reads it automatically
 * so every `log.*()` call is correlated for free.
 */
const asyncLocalStorage = new AsyncLocalStorage();

/**
 * The current request/job correlation ID, or `null` outside any tracked
 * context (e.g. app startup, a script run directly).
 *
 * @returns {string | null}
 */
export function getRequestId() {
  return asyncLocalStorage.getStore()?.requestId ?? null;
}

/**
 * Run `fn` inside a context carrying `requestId`. Used both to seed the
 * per-HTTP-request scope and to propagate a request's ID into background
 * job execution (or mint a new one for jobs with no originating request,
 * e.g. cron-triggered jobs) — a job runs on a later tick with no HTTP
 * request's AsyncLocalStorage scope active, so its context must be
 * re-established explicitly at execution time.
 *
 * @template T
 * @param {string | null | undefined} requestId
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithRequestId(requestId, fn) {
  return asyncLocalStorage.run({ requestId: requestId || randomUUID() }, fn);
}
