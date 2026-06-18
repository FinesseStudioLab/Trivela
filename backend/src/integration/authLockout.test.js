import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../index.js';

// End-to-end coverage for the brute-force lockout (#588): drive real HTTP
// requests through the full middleware stack against a protected route.
//
// `delayFn` is stubbed to a no-op so the progressive delay doesn't slow the
// suite; thresholds are lowered so a handful of requests reach the lockout.
function createTestApp(options = {}) {
  return createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    disableRedis: true,
    skipEnvValidation: true,
    apiKeys: 'test-key-123',
    authLockout: {
      softThreshold: 2,
      hardThreshold: 3,
      delayFn: async () => {},
      ...(options.authLockout ?? {}),
    },
    ...options,
  });
}

test('repeated bad API keys lock the client out with 429 + Retry-After', async () => {
  const app = await createTestApp();
  const payload = { name: 'X', description: 'Y', rewardPerAction: 1 };

  // Three rejected attempts (the configured hard threshold).
  for (let i = 0; i < 3; i += 1) {
    await request(app)
      .post('/api/v1/campaigns')
      .set('X-API-Key', 'wrong-key')
      .send(payload)
      .expect(401);
  }

  // The next attempt is locked out before auth even runs.
  const locked = await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'wrong-key')
    .send(payload)
    .expect(429);

  assert.equal(locked.body.code, 'AUTH_LOCKED_OUT');
  assert.ok(Number(locked.headers['retry-after']) > 0);
  assert.equal(locked.headers['x-auth-lockout'], 'active');
});

test('a locked-out client is blocked even when presenting the correct key', async () => {
  const app = await createTestApp();
  const payload = { name: 'X', description: 'Y', rewardPerAction: 1 };

  for (let i = 0; i < 3; i += 1) {
    await request(app).post('/api/v1/campaigns').set('X-API-Key', 'wrong-key').send(payload);
  }

  // Even the valid key can't get through while the lockout is active.
  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'test-key-123')
    .send(payload)
    .expect(429);
});

test('a successful auth before the threshold clears accumulated failures', async () => {
  const app = await createTestApp();
  const payload = { name: 'X', description: 'Y', rewardPerAction: 1 };

  // Two failures (below the hard threshold of 3)...
  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'wrong-key')
    .send(payload)
    .expect(401);
  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'wrong-key')
    .send(payload)
    .expect(401);

  // ...then a success resets the counter.
  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'test-key-123')
    .send(payload)
    .expect(201);

  // A fresh failure should be treated as the first again (still 401, not 429).
  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'wrong-key')
    .send(payload)
    .expect(401);
});

test('/metrics surfaces the auth failure and lockout counters', async () => {
  const app = await createTestApp();
  const payload = { name: 'X', description: 'Y', rewardPerAction: 1 };

  for (let i = 0; i < 3; i += 1) {
    await request(app).post('/api/v1/campaigns').set('X-API-Key', 'wrong-key').send(payload);
  }

  const metrics = await request(app).get('/metrics').expect(200);
  assert.match(metrics.text, /trivela_auth_failures_total \d+/);
  assert.match(metrics.text, /trivela_auth_lockouts_total [1-9]\d*/);
});

test('GET /api/v1 advertises the auth-lockout policy', async () => {
  const app = await createTestApp();
  const response = await request(app).get('/api/v1').expect(200);
  assert.equal(response.body.authLockout.keying, 'per client IP address');
  assert.equal(response.body.authLockout.softThreshold, 2);
  assert.equal(response.body.authLockout.hardThreshold, 3);
});
