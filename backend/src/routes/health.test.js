/**
 * Unit tests for the extracted health/metrics router (#744).
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHealthRoutes } from './health.js';

function buildApp(overrides = {}) {
  const deps = {
    rpcPool: {
      getHealthyRpcUrl: () => 'http://rpc.test',
      getStatus: () => ({ in_use: 0, idle: 2, waiting: 0, healthy: 2, unhealthy: 0 }),
      markUnhealthy: vi.fn(),
    },
    checkSorobanRpcHealth: vi.fn().mockResolvedValue({ status: 'ok', latencyMs: 12 }),
    fetchImpl: undefined,
    rpcHealthCache: { payload: null },
    eventIndexer: {
      getHealth: () => ({
        status: 'ok',
        lastLedger: 100,
        lagLedgers: 0,
        eventsTotal: 500,
        errorsTotal: 0,
      }),
    },
    jobRunner: { getStatus: () => ({ queueLength: 3 }) },
    durableJobQueue: { getStatus: () => ({ pending: 1 }) },
    metrics: {
      requestTotal: 42,
      requestErrors: 1,
      authFailures: 0,
      authLockouts: 0,
      routeHits: new Map([['GET /health', 10]]),
      latencyBuckets: [50, 100, 500, Infinity],
      latencyCounts: [8, 5, 3, 1],
      latencyTotal: 17,
      latencySum: 800,
    },
    isShuttingDown: () => false,
    ...overrides,
  };

  const app = express();
  app.use(createHealthRoutes(deps));
  return { app, deps };
}

describe('GET /health', () => {
  it('returns 200 with status ok when RPC is healthy', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('trivela-api');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('returns degraded when RPC check returns non-ok', async () => {
    const { app } = buildApp({
      checkSorobanRpcHealth: vi.fn().mockResolvedValue({ status: 'error' }),
    });
    const res = await request(app).get('/health');
    expect(res.body.status).toBe('degraded');
  });

  it('uses cached payload when available', async () => {
    const spy = vi.fn().mockResolvedValue({ status: 'ok' });
    const { app } = buildApp({
      rpcHealthCache: { payload: { status: 'ok', cached: true } },
      checkSorobanRpcHealth: spy,
    });
    await request(app).get('/health');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('GET /ready', () => {
  it('returns 200 when not shutting down', async () => {
    const { app } = buildApp({ isShuttingDown: () => false });
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  it('returns 503 when shutting down', async () => {
    const { app } = buildApp({ isShuttingDown: () => true });
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('shutting_down');
  });
});

describe('GET /health/indexer', () => {
  it('returns 200 when indexer is ok', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/health/indexer');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns 503 when indexer status is error', async () => {
    const { app } = buildApp({
      eventIndexer: {
        getHealth: () => ({
          status: 'error',
          lastLedger: 0,
          lagLedgers: 99,
          eventsTotal: 0,
          errorsTotal: 5,
        }),
      },
    });
    const res = await request(app).get('/health/indexer');
    expect(res.status).toBe(503);
  });

  it('returns 503 when eventIndexer is null', async () => {
    const { app } = buildApp({ eventIndexer: null });
    const res = await request(app).get('/health/indexer');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
  });
});

describe('GET /metrics', () => {
  it('returns text/plain content with prometheus format', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch('text/plain');
    expect(res.text).toContain('trivela_requests_total 42');
    expect(res.text).toContain('trivela_request_errors_total 1');
  });

  it('includes route hit counters', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('trivela_route_hits_total');
  });
});
