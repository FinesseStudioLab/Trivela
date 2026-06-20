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
