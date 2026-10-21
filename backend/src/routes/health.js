/**
 * Health and observability routes — extracted from index.js (#744).
 *
 * Provides /health, /ready, /health/rpc, /health/indexer, and /metrics
 * as a standalone Express router so index.js becomes pure wiring.
 */

import { Router } from 'express';

/**
 * @param {{
 *   rpcPool: { getHealthyRpcUrl(): string, getStatus(): object, markUnhealthy(url: string): void },
 *   checkSorobanRpcHealth: (opts: { rpcUrl: string, fetchImpl?: Function }) => Promise<object>,
 *   fetchImpl?: Function,
 *   rpcHealthCache: { payload: object | null },
 *   eventIndexer: { getHealth?(): object } | null,
 *   jobRunner: { getStatus(): object },
 *   durableJobQueue: { getStatus(): object },
 *   metrics: {
 *     requestTotal: number,
 *     requestErrors: number,
 *     authFailures: number,
 *     authLockouts: number,
 *     routeHits: Map<string, number>,
 *     latencyBuckets: number[],
 *     latencyCounts: number[],
 *     latencyTotal: number,
 *     latencySum: number,
 *   },
 *   isShuttingDown: () => boolean,
 * }} deps
 * @returns {import('express').Router}
 */
export function createHealthRoutes(deps) {
  const {
    rpcPool,
    checkSorobanRpcHealth,
    fetchImpl,
    rpcHealthCache,
    eventIndexer,
    jobRunner,
    durableJobQueue,
    metrics,
    isShuttingDown,
  } = deps;

  const router = Router();

  router.get('/health', async (_req, res) => {
    const rpcUrl = rpcPool.getHealthyRpcUrl();
    const rpc = rpcHealthCache.payload ?? (await checkSorobanRpcHealth({ rpcUrl, fetchImpl }));
    res.json({
      status: /** @type {any} */ (rpc).status === 'ok' ? 'ok' : 'degraded',
      service: 'trivela-api',
      timestamp: new Date().toISOString(),
      rpc,
      rpcPool: rpcPool.getStatus(),
    });
  });

  router.get('/ready', (_req, res) => {
    if (isShuttingDown()) {
      return res.status(503).json({ status: 'shutting_down', ready: false });
    }
    return res.json({ status: 'ok', ready: true });
  });

  router.get('/health/rpc', async (_req, res) => {
    const rpcUrl = rpcPool.getHealthyRpcUrl();
    const rpc = await checkSorobanRpcHealth({ rpcUrl, fetchImpl });
    if (/** @type {any} */ (rpc).status !== 'ok') {
      rpcPool.markUnhealthy(rpcUrl);
    }
    res.status(/** @type {any} */ (rpc).status === 'ok' ? 200 : 503).json({
      ...rpc,
      rpcPool: rpcPool.getStatus(),
    });
  });

  router.get('/health/indexer', (_req, res) => {
    const health = eventIndexer?.getHealth?.() ?? {
      status: 'unavailable',
      lastLedger: 0,
      lagLedgers: 0,
      eventsTotal: 0,
      errorsTotal: 0,
    };
    const isHealthy = health.status === 'ok' || health.status === 'idle';
    res.status(isHealthy ? 200 : 503).json(health);
  });

  router.get('/metrics', (_req, res) => {
    const uptimeSeconds = process.uptime();
    const routeLines = [...metrics.routeHits.entries()]
      .map(([route, count]) => {
        const escapedRoute = route.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `trivela_route_hits_total{route="${escapedRoute}"} ${count}`;
      })
      .join('\n');

    const latencyBucketLines = metrics.latencyBuckets
      .map((le, i) => {
        const cumulative = metrics.latencyCounts.slice(0, i + 1).reduce((a, b) => a + b, 0);
        const leLabel = le === Infinity ? '+Inf' : String(le);
        return `trivela_http_request_duration_ms_bucket{le="${leLabel}"} ${cumulative}`;
      })
      .join('\n');

    const poolStatus = rpcPool.getStatus();
    const jobRunnerStatus = jobRunner.getStatus();
    const durableJobQueueStatus = durableJobQueue.getStatus();

    const payload = [
      '# HELP trivela_requests_total Total HTTP requests handled.',
      '# TYPE trivela_requests_total counter',
      `trivela_requests_total ${metrics.requestTotal}`,
      '# HELP trivela_request_errors_total Total HTTP requests with status >= 400.',
      '# TYPE trivela_request_errors_total counter',
      `trivela_request_errors_total ${metrics.requestErrors}`,
      '# HELP trivela_auth_failures_total Total failed authentication attempts on guarded routes.',
      '# TYPE trivela_auth_failures_total counter',
      `trivela_auth_failures_total ${metrics.authFailures}`,
      '# HELP trivela_auth_lockouts_total Total brute-force lockouts triggered on guarded routes.',
      '# TYPE trivela_auth_lockouts_total counter',
      `trivela_auth_lockouts_total ${metrics.authLockouts}`,
      '# HELP trivela_process_uptime_seconds Node.js process uptime.',
      '# TYPE trivela_process_uptime_seconds gauge',
      `trivela_process_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
      '# HELP trivela_route_hits_total Route-level request counts.',
      '# TYPE trivela_route_hits_total counter',
      routeLines,
      '# HELP trivela_http_request_duration_ms HTTP request duration in milliseconds.',
      '# TYPE trivela_http_request_duration_ms histogram',
      latencyBucketLines,
      `trivela_http_request_duration_ms_count ${metrics.latencyTotal}`,
      `trivela_http_request_duration_ms_sum ${metrics.latencySum}`,
      '# HELP trivela_rpc_pool_in_use RPC pool slots currently in use.',
      '# TYPE trivela_rpc_pool_in_use gauge',
      `trivela_rpc_pool_in_use ${/** @type {any} */ (poolStatus).in_use}`,
      '# HELP trivela_rpc_pool_idle RPC pool slots immediately available.',
      '# TYPE trivela_rpc_pool_idle gauge',
      `trivela_rpc_pool_idle ${/** @type {any} */ (poolStatus).idle}`,
      '# HELP trivela_rpc_pool_waiting Callers queued waiting for a pool slot.',
      '# TYPE trivela_rpc_pool_waiting gauge',
      `trivela_rpc_pool_waiting ${/** @type {any} */ (poolStatus).waiting}`,
      '# HELP trivela_rpc_pool_healthy Healthy RPC endpoints in the pool.',
      '# TYPE trivela_rpc_pool_healthy gauge',
      `trivela_rpc_pool_healthy ${/** @type {any} */ (poolStatus).healthy}`,
      '# HELP trivela_job_runner_queue_length Jobs currently queued in the job runner.',
      '# TYPE trivela_job_runner_queue_length gauge',
      `trivela_job_runner_queue_length ${/** @type {any} */ (jobRunnerStatus).queueLength ?? 0}`,
      '# HELP trivela_durable_job_queue_pending Durable job queue pending count.',
      '# TYPE trivela_durable_job_queue_pending gauge',
      `trivela_durable_job_queue_pending ${/** @type {any} */ (durableJobQueueStatus).pending ?? 0}`,
    ]
      .filter(Boolean)
      .join('\n');

    res.set('Content-Type', 'text/plain; version=0.0.4').send(payload);
  });

  return router;
}
