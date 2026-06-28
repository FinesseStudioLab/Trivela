import assert from 'node:assert/strict';
import test from 'node:test';
import { createRpcPool } from './rpcPool.js';

test('getHealthyRpcUrl returns the configured URL for a single-endpoint pool', () => {
  const pool = createRpcPool(['https://rpc1.example.com']);
  assert.equal(pool.getHealthyRpcUrl(), 'https://rpc1.example.com');
});

test('round-robins across all healthy endpoints', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com', 'https://c.com']);
  const seen = new Set();
  for (let i = 0; i < 9; i++) seen.add(pool.getHealthyRpcUrl());
  assert.equal(seen.size, 3, 'all three endpoints should be visited');
});

test('failover: unhealthy endpoint is skipped', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com']);
  pool.markUnhealthy('https://a.com');
  for (let i = 0; i < 5; i++) {
    assert.equal(pool.getHealthyRpcUrl(), 'https://b.com');
  }
});

test('all-unhealthy falls back to first endpoint', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com']);
  pool.markUnhealthy('https://a.com');
  pool.markUnhealthy('https://b.com');
  assert.equal(pool.getHealthyRpcUrl(), 'https://a.com');
});

test('recovery after backoff period', async () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com'], { backoffMs: 20 });
  pool.markUnhealthy('https://a.com');
  assert.equal(pool.getHealthyRpcUrl(), 'https://b.com');

  await new Promise((resolve) => setTimeout(resolve, 30));

  const status = pool.getStatus();
  assert.equal(status.healthy, 2, 'endpoint a should have recovered after backoff');
  assert.equal(status.unhealthy, 0);
});

test('getStatus reports correct healthy and unhealthy counts', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com', 'https://c.com']);
  pool.markUnhealthy('https://a.com');
  const status = pool.getStatus();
  assert.equal(status.healthy, 2);
  assert.equal(status.unhealthy, 1);
  assert.equal(status.urls.length, 3);
  assert.equal(status.urls.find((u) => u.url === 'https://a.com').healthy, false);
});

test('markHealthy re-enables a previously unhealthy endpoint', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com']);
  pool.markUnhealthy('https://a.com');
  assert.equal(pool.getStatus().unhealthy, 1);
  pool.markHealthy('https://a.com');
  assert.equal(pool.getStatus().unhealthy, 0);
});

test('createRpcPool throws for empty URL list', () => {
  assert.throws(() => createRpcPool([]), /at least one URL/);
});

test('getUrls returns all configured URLs in order', () => {
  const urls = ['https://a.com', 'https://b.com'];
  const pool = createRpcPool(urls);
  assert.deepEqual(pool.getUrls(), urls);
});

// ---------------------------------------------------------------------------
// Circuit breaker tests (#569)
// ---------------------------------------------------------------------------

test('circuit: breaker starts closed for all endpoints', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com'], {
    circuitBreaker: { windowSize: 4, errorThreshold: 0.5 },
  });
  const { urls } = pool.getStatus();
  assert.equal(urls[0].breakerState, 'closed');
  assert.equal(urls[1].breakerState, 'closed');
});

test('circuit: breaker opens after error rate meets threshold', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com'], {
    circuitBreaker: { windowSize: 4, errorThreshold: 0.5 },
  });
  // 4/4 errors fills window at >= 50% threshold — breaker should trip.
  for (let i = 0; i < 4; i++) {
    pool.reportOutcome('https://a.com', { success: false });
  }
  const ep = pool.getStatus().urls.find((u) => u.url === 'https://a.com');
  assert.equal(ep.breakerState, 'open');
});

test('circuit: open endpoint is skipped in round-robin', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com'], {
    circuitBreaker: { windowSize: 2, errorThreshold: 0.5 },
  });
  pool.reportOutcome('https://a.com', { success: false });
  pool.reportOutcome('https://a.com', { success: false });
  assert.equal(
    pool.getStatus().urls.find((u) => u.url === 'https://a.com').breakerState,
    'open',
  );
  // All requests should be routed to b.com while a.com's breaker is open.
  for (let i = 0; i < 5; i++) {
    assert.equal(pool.getHealthyRpcUrl(), 'https://b.com');
  }
});

test('circuit: open breaker transitions to half_open after cooldown', async () => {
  const pool = createRpcPool(['https://a.com'], {
    circuitBreaker: { windowSize: 2, errorThreshold: 0.5, openDurationMs: 20 },
  });
  pool.reportOutcome('https://a.com', { success: false });
  pool.reportOutcome('https://a.com', { success: false });
  assert.equal(pool.getStatus().urls[0].breakerState, 'open');

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(pool.getStatus().urls[0].breakerState, 'half_open');
});

test('circuit: successful probe closes the breaker', async () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com'], {
    circuitBreaker: { windowSize: 2, errorThreshold: 0.5, openDurationMs: 20 },
  });
  pool.reportOutcome('https://a.com', { success: false });
  pool.reportOutcome('https://a.com', { success: false });

  await new Promise((resolve) => setTimeout(resolve, 30));
  pool.getStatus(); // trigger OPEN → HALF_OPEN transition

  const probeUrl = pool.getHealthyRpcUrl();
  assert.equal(probeUrl, 'https://a.com', 'half-open endpoint should be selected for probe');

  pool.reportOutcome('https://a.com', { success: true, latencyMs: 100 });
  assert.equal(
    pool.getStatus().urls.find((u) => u.url === 'https://a.com').breakerState,
    'closed',
  );
});

test('circuit: failed probe in half_open re-opens the breaker', async () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com'], {
    circuitBreaker: { windowSize: 2, errorThreshold: 0.5, openDurationMs: 20 },
  });
  pool.reportOutcome('https://a.com', { success: false });
  pool.reportOutcome('https://a.com', { success: false });

  await new Promise((resolve) => setTimeout(resolve, 30));
  pool.getStatus(); // trigger OPEN → HALF_OPEN transition
  pool.getHealthyRpcUrl(); // consume probe slot

  pool.reportOutcome('https://a.com', { success: false });
  assert.equal(
    pool.getStatus().urls.find((u) => u.url === 'https://a.com').breakerState,
    'open',
    'failed probe should reopen the breaker',
  );
});

test('circuit: slow calls above latency threshold count as errors', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com'], {
    circuitBreaker: { windowSize: 2, errorThreshold: 0.5, latencyThresholdMs: 500 },
  });
  pool.reportOutcome('https://a.com', { success: true, latencyMs: 600 });
  pool.reportOutcome('https://a.com', { success: true, latencyMs: 700 });
  assert.equal(
    pool.getStatus().urls.find((u) => u.url === 'https://a.com').breakerState,
    'open',
    'two slow calls should trip the breaker',
  );
});

test('circuit: getStatus exposes breakerState per endpoint', () => {
  const pool = createRpcPool(['https://a.com', 'https://b.com'], {
    circuitBreaker: { windowSize: 2, errorThreshold: 0.5 },
  });
  pool.reportOutcome('https://a.com', { success: false });
  pool.reportOutcome('https://a.com', { success: false });
  const { urls } = pool.getStatus();
  assert.equal(urls.find((u) => u.url === 'https://a.com').breakerState, 'open');
  assert.equal(urls.find((u) => u.url === 'https://b.com').breakerState, 'closed');
});

test('circuit: markHealthy resets a tripped breaker to closed', () => {
  const pool = createRpcPool(['https://a.com'], {
    circuitBreaker: { windowSize: 2, errorThreshold: 0.5 },
  });
  pool.reportOutcome('https://a.com', { success: false });
  pool.reportOutcome('https://a.com', { success: false });
  assert.equal(pool.getStatus().urls[0].breakerState, 'open');

  pool.markHealthy('https://a.com');
  assert.equal(pool.getStatus().urls[0].breakerState, 'closed');
});

test('circuit: window fills gradually — no trip before windowSize reached', () => {
  const pool = createRpcPool(['https://a.com'], {
    circuitBreaker: { windowSize: 5, errorThreshold: 0.5 },
  });
  // 4 errors but window isn't full yet (windowSize=5) — should stay closed.
  for (let i = 0; i < 4; i++) {
    pool.reportOutcome('https://a.com', { success: false });
  }
  assert.equal(pool.getStatus().urls[0].breakerState, 'closed');
  // Fifth error fills the window at 100% — now trips.
  pool.reportOutcome('https://a.com', { success: false });
  assert.equal(pool.getStatus().urls[0].breakerState, 'open');
});
