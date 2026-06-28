/**
 * Per-route request deadline middleware (issue #650 — request deadlines).
 *
 * Attaches an AbortSignal to `req.signal` that fires after `ms` milliseconds.
 * When the deadline elapses the signal is aborted, the response is flushed
 * with 504 Gateway Timeout, and subsequent handler writes are suppressed.
 *
 * When the client disconnects before the deadline the signal is also aborted
 * so DB/RPC work queued downstream can short-circuit.
 *
 * Usage (per-route):
 *   import { requestTimeout } from './middleware/timeout.js';
 *   app.get('/expensive', requestTimeout(10_000), handler);
 *
 * Usage (global default — applied in index.js):
 *   app.use(requestTimeout(Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000)));
 *
 * Downstream handlers that do async work should check `req.signal.aborted`
 * before each expensive step, or pass req.signal to fetch() / pool.acquire().
 */

/**
 * @param {number} ms  Deadline in milliseconds.
 * @returns {import('express').RequestHandler}
 */
export function requestTimeout(ms) {
  return function timeoutMiddleware(req, res, next) {
    const ac = new AbortController();

    // Wire client-disconnect → abort so downstream work cancels early.
    function onClose() {
      if (!ac.signal.aborted) ac.abort(new Error('client disconnected'));
    }
    res.on('close', onClose);

    const timer = setTimeout(() => {
      if (res.headersSent) return;
      ac.abort(new Error(`request timed out after ${ms}ms`));
      res
        .status(504)
        .set('Content-Type', 'application/json')
        .end(JSON.stringify({ error: 'Request timeout', code: 'REQUEST_TIMEOUT' }));
    }, ms);

    // Don't hold the event loop open past the response.
    if (typeof timer.unref === 'function') timer.unref();

    // Attach signal so downstream middleware/handlers can observe it.
    req.signal = ac.signal;

    res.on('finish', () => {
      clearTimeout(timer);
      res.off('close', onClose);
      // Abort so any still-pending downstream fetch/acquire calls cancel.
      if (!ac.signal.aborted) ac.abort(new Error('response finished'));
    });

    next();
  };
}
