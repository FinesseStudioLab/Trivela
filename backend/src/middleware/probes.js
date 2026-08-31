// @ts-check

/**
 * Creates health and probe handlers for Kubernetes liveness and readiness checks.
 * @param {object} [options]
 * @param {() => boolean} [options.getIsShuttingDown]
 */
export function createProbeHandlers(options = {}) {
  const getIsShuttingDown = options.getIsShuttingDown ?? (() => false);

  /** Liveness probe handler - checks if the application process is running */
  function livenessHandler(_req, res) {
    res.status(200).json({ status: 'ok', live: true });
  }

  /** Readiness probe handler - checks if application is ready to receive traffic */
  function readinessHandler(_req, res) {
    if (getIsShuttingDown()) {
      return res.status(503).json({ status: 'shutting_down', ready: false });
    }
    res.status(200).json({ status: 'ok', ready: true });
  }

  return {
    livenessHandler,
    readinessHandler,
  };
}
