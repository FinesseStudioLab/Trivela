// @ts-check
/**
 * Route tests for #922 — POST /campaigns/:id/claimable-balances enqueues a
 * durable-queue job and returns immediately instead of blocking on Horizon
 * submission. Run with: node --test src/routes/claimableBalances.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../index.js';

const API_KEY = 'test-key-123';

function createTestApp(options = {}) {
  return createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    apiKeys: API_KEY,
    ...options,
  });
}

async function createCampaign(app) {
  const res = await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', API_KEY)
    .send({ name: 'Ending Campaign', rewardPerAction: 1 })
    .expect(201);
  return res.body;
}

test('POST /campaigns/:id/claimable-balances enqueues and returns 202 immediately', async () => {
  const app = await createTestApp();
  const campaign = await createCampaign(app);

  const res = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/claimable-balances`)
    .set('X-API-Key', API_KEY)
    .send({})
    .expect(202);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.campaignId, String(campaign.id));
  assert.equal(res.body.status, 'queued');
  assert.ok(res.body.jobId, 'response includes a jobId');
});

test('POST /campaigns/:id/claimable-balances returns 404 for an unknown campaign', async () => {
  const app = await createTestApp();

  await request(app)
    .post('/api/v1/campaigns/does-not-exist/claimable-balances')
    .set('X-API-Key', API_KEY)
    .send({})
    .expect(404);
});

test('POST /campaigns/:id/claimable-balances is idempotent under a repeated Idempotency-Key', async () => {
  const app = await createTestApp();
  const campaign = await createCampaign(app);

  const first = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/claimable-balances`)
    .set('X-API-Key', API_KEY)
    .set('Idempotency-Key', 'test-idem-key-abc123')
    .send({})
    .expect(202);

  const second = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/claimable-balances`)
    .set('X-API-Key', API_KEY)
    .set('Idempotency-Key', 'test-idem-key-abc123')
    .send({})
    .expect(202);

  // Same cached response replayed — proves the second POST never reached
  // the handler and never enqueued a second job.
  assert.equal(second.body.jobId, first.body.jobId);
  assert.equal(second.headers['idempotent-previous-request'], 'true');
});

test('POST /campaigns/:id/claimable-balances without an Idempotency-Key enqueues a fresh job each time', async () => {
  const app = await createTestApp();
  const campaign = await createCampaign(app);

  const first = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/claimable-balances`)
    .set('X-API-Key', API_KEY)
    .send({})
    .expect(202);

  const second = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/claimable-balances`)
    .set('X-API-Key', API_KEY)
    .send({})
    .expect(202);

  assert.notEqual(second.body.jobId, first.body.jobId);
});
