import assert from 'node:assert/strict';
import test from 'node:test';
import { createProbeHandlers } from './probes.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const ok = () => ({ run: () => {} });
const fail = (message, extra = {}) => ({
  run: () => {
    throw new Error(message);
  },
  ...extra,
});

test('liveness never runs dependency checks', () => {
  let ran = false;
  const { livenessHandler } = createProbeHandlers({
    checks: { database: { run: () => (ran = true) } },
  });
  const res = makeRes();
  livenessHandler({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'ok', live: true });
  assert.equal(ran, false);
});

test('readiness with no checks stays ready', async () => {
  const { readinessHandler } = createProbeHandlers();
  const res = makeRes();
  await readinessHandler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ready, true);
  assert.equal(res.body.status, 'ok');
});

test('readiness reports every passing check with its latency', async () => {
  const { readinessHandler } = createProbeHandlers({
    checks: { database: ok(), redis: { run: () => ({ mode: 'standalone' }) }, skipped: null },
  });
  const res = makeRes();
  await readinessHandler({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body.checks), ['database', 'redis']);
  assert.equal(res.body.checks.database.status, 'ok');
  assert.equal(typeof res.body.checks.database.latencyMs, 'number');
  assert.equal(res.body.checks.redis.mode, 'standalone');
});

test('a failing required check returns 503 and names the failure', async () => {
  const { readinessHandler } = createProbeHandlers({
    checks: { database: fail('disk I/O error'), redis: ok() },
  });
  const res = makeRes();
  await readinessHandler({}, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ready, false);
  assert.equal(res.body.status, 'unavailable');
  assert.equal(res.body.checks.database.status, 'fail');
  assert.equal(res.body.checks.database.error, 'disk I/O error');
  assert.equal(res.body.checks.redis.status, 'ok');
});

test('a failing optional check degrades but stays ready', async () => {
  const { readinessHandler } = createProbeHandlers({
    checks: { database: ok(), rpc: fail('rpc down', { required: false }) },
  });
  const res = makeRes();
  await readinessHandler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ready, true);
  assert.equal(res.body.status, 'degraded');
  assert.equal(res.body.checks.rpc.required, false);
});

test('a hanging check times out instead of hanging the probe', async () => {
  const { readinessHandler } = createProbeHandlers({
    timeoutMs: 20,
    checks: { rpc: { run: () => new Promise(() => {}) } },
  });
  const res = makeRes();
  await readinessHandler({}, res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.checks.rpc.error, /timed out after 20ms/);
});

test('async rejections are caught', async () => {
  const { readinessHandler } = createProbeHandlers({
    checks: { redis: { run: async () => Promise.reject(new Error('ECONNREFUSED')) } },
  });
  const res = makeRes();
  await readinessHandler({}, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.checks.redis.error, 'ECONNREFUSED');
});

test('shutting down short-circuits readiness without running checks', async () => {
  let ran = false;
  const { readinessHandler } = createProbeHandlers({
    getIsShuttingDown: () => true,
    checks: { database: { run: () => (ran = true) } },
  });
  const res = makeRes();
  await readinessHandler({}, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { status: 'shutting_down', ready: false });
  assert.equal(ran, false);
});

test('healthz adds uptime and the supplied cached details', () => {
  let t = 1_000;
  const { healthHandler } = createProbeHandlers({
    now: () => t,
    healthDetails: () => ({ rpc: { healthy: 2 } }),
  });
  t += 5_500;
  const res = makeRes();
  healthHandler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.uptimeSeconds, 5);
  assert.deepEqual(res.body.rpc, { healthy: 2 });
});

// ── Wired into the app (#1251) ───────────────────────────────────────────────
import request from 'supertest';
import { createApp } from '../index.js';

async function makeApp(options = {}) {
  return createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    disableRedis: true,
    rateLimit: { windowMs: 60_000, maxRequests: 10_000 },
    ...options,
  });
}

const rpcOk = async () => ({
  ok: true,
  json: async () => ({ result: { status: 'healthy', latestLedger: 1 } }),
});
const rpcDown = async () => {
  throw new Error('connect ECONNREFUSED');
};

test('/readyz: database ok, RPC healthy -> 200 ok', async () => {
  const app = await makeApp({ fetchImpl: rpcOk });
  const res = await request(app).get('/readyz').expect(200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.checks.database.status, 'ok');
  assert.equal(res.body.checks.rpc.status, 'ok');
  assert.equal(res.body.checks.redis, undefined, 'no Redis configured, so no Redis check');
});

test('/readyz: RPC down is reported as degraded but stays ready by default', async () => {
  const app = await makeApp({ fetchImpl: rpcDown });
  const res = await request(app).get('/readyz').expect(200);
  assert.equal(res.body.status, 'degraded');
  assert.equal(res.body.checks.rpc.status, 'fail');
  assert.equal(res.body.checks.rpc.required, false);
});

test('/readyz: RPC down fails readiness when READINESS_REQUIRE_RPC is set', async () => {
  const app = await makeApp({ fetchImpl: rpcDown, readinessRequireRpc: true });
  const res = await request(app).get('/readyz').expect(503);
  assert.equal(res.body.ready, false);
  assert.equal(res.body.checks.rpc.required, true);
});

test('/readyz: a broken database fails readiness', async () => {
  const app = await makeApp({ fetchImpl: rpcOk });
  app._close(); // closes the SQLite handle and starts shutdown
  const res = await request(app).get('/health/ready');
  assert.equal(res.statusCode, 503);
});

test('/healthz reports uptime and the RPC pool without touching the network', async () => {
  const app = await makeApp({ fetchImpl: rpcDown });
  const res = await request(app).get('/healthz').expect(200);
  assert.equal(res.body.live, true);
  assert.equal(typeof res.body.uptimeSeconds, 'number');
  assert.ok(res.body.rpc);
  await request(app).get('/livez').expect(200);
});
