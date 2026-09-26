// @ts-check

/**
 * @typedef {{
 *   run: () => unknown | Promise<unknown>,
 *   required?: boolean,
 * }} ProbeCheck
 */

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, message) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Creates health and probe handlers for Kubernetes liveness and readiness checks.
 *
 * - `/livez`   liveness: the process is up. Never touches dependencies.
 * - `/healthz` health: liveness plus uptime and any cheap, cached details
 *              (e.g. the RPC pool state) supplied via `healthDetails`.
 * - `/readyz`  readiness: runs the dependency `checks` (database, Redis,
 *              Soroban RPC, ...) in parallel, each under `timeoutMs`. It returns
 *              503 only when a *required* check fails (or the process is
 *              shutting down); a failing optional check reports `degraded` but
 *              still returns 200, so an RPC blip does not pull every pod out of
 *              rotation.
 *
 * @param {object} [options]
 * @param {() => boolean} [options.getIsShuttingDown]
 * @param {Record<string, ProbeCheck | null | undefined>} [options.checks]
 * @param {number} [options.timeoutMs] per-check timeout (default 2000)
 * @param {() => Record<string, unknown>} [options.healthDetails]
 * @param {() => number} [options.now]
 */
export function createProbeHandlers(options = {}) {
  const getIsShuttingDown = options.getIsShuttingDown ?? (() => false);
  const checks = options.checks ?? {};
  const timeoutMs = options.timeoutMs ?? 2000;
  const healthDetails = options.healthDetails;
  const now = options.now ?? (() => Date.now());
  const startedAt = now();

  const uptimeSeconds = () => Math.floor((now() - startedAt) / 1000);

  /**
   * @param {string} name
   * @param {ProbeCheck} check
   */
  async function runCheck(name, check) {
    const required = check.required !== false;
    const started = now();
    try {
      const detail = await withTimeout(
        Promise.resolve().then(() => check.run()),
        timeoutMs,
        `${name} check timed out after ${timeoutMs}ms`,
      );
      return {
        status: 'ok',
        required,
        latencyMs: now() - started,
        ...(detail && typeof detail === 'object' ? detail : {}),
      };
    } catch (err) {
      return {
        status: 'fail',
        required,
        latencyMs: now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Liveness probe handler - checks if the application process is running */
  function livenessHandler(_req, res) {
    res.status(200).json({ status: 'ok', live: true });
  }

  /** Health handler - liveness plus uptime and cached dependency details */
  function healthHandler(_req, res) {
    res.status(200).json({
      status: 'ok',
      live: true,
      uptimeSeconds: uptimeSeconds(),
      ...(healthDetails ? healthDetails() : {}),
    });
  }

  /** Readiness probe handler - checks if application is ready to receive traffic */
  async function readinessHandler(_req, res) {
    if (getIsShuttingDown()) {
      return res.status(503).json({ status: 'shutting_down', ready: false });
    }

    const entries = Object.entries(checks).filter((entry) => entry[1]);
    const results = await Promise.all(
      entries.map(async ([name, check]) => [
        name,
        await runCheck(name, /** @type {ProbeCheck} */ (check)),
      ]),
    );
    const byName = Object.fromEntries(results);

    const requiredFailed = results.some(([, r]) => r.status === 'fail' && r.required);
    const optionalFailed = results.some(([, r]) => r.status === 'fail' && !r.required);
    const status = requiredFailed ? 'unavailable' : optionalFailed ? 'degraded' : 'ok';

    res.status(requiredFailed ? 503 : 200).json({
      status,
      ready: !requiredFailed,
      uptimeSeconds: uptimeSeconds(),
      checks: byName,
    });
  }

  return {
    livenessHandler,
    healthHandler,
    readinessHandler,
  };
}
