import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../index.js';

function createTestApp(options = {}) {
  return createApp({
    dbPath: ':memory:',
    campaigns: [
      {
        name: 'Test Campaign',
        description: 'Test description',
        active: true,
        rewardPerAction: 10,
        createdAt: new Date().toISOString(),
      },
    ],
    disableJobs: true,
    skipEnvValidation: true,
    ...options,
  });
}

// ── GET ──────────────────────────────────────────────────────────────────────

test('GET /api/v1/campaigns returns paginated campaign list', async () => {
  const app = await createTestApp();
  const response = await request(app).get('/api/v1/campaigns').expect(200);

  assert.ok(Array.isArray(response.body.data));
  assert.ok(response.body.pagination);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].name, 'Test Campaign');
  assert.equal(response.body.pagination.total, 1);
});

test('GET /api/v1/campaigns/:id returns campaign by id', async () => {
  const app = await createTestApp();
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  const response = await request(app).get(`/api/v1/campaigns/${campaignId}`).expect(200);

  assert.equal(response.body.id, campaignId);
  assert.equal(response.body.name, 'Test Campaign');
  assert.equal(response.body.description, 'Test description');
});

test('GET /api/v1/campaigns/:id returns 404 for non-existent campaign', async () => {
  const app = await createTestApp();
  const response = await request(app).get('/api/v1/campaigns/999').expect(404);

  assert.equal(response.body.error, 'Campaign not found');
  assert.equal(response.body.code, 'CAMPAIGN_NOT_FOUND');
});

test('GET /api/v1/campaigns response includes all expected fields', async () => {
  const app = await createTestApp();
  const response = await request(app).get('/api/v1/campaigns').expect(200);
  const campaign = response.body.data[0];

  assert.ok('id' in campaign);
  assert.ok('name' in campaign);
  assert.ok('description' in campaign);
  assert.ok('active' in campaign);
  assert.ok('rewardPerAction' in campaign);
  assert.ok('createdAt' in campaign);
});

// ── POST ─────────────────────────────────────────────────────────────────────

test('POST /api/v1/campaigns creates a new campaign without API key when not configured', async () => {
  const app = await createTestApp();
  const newCampaign = { name: 'New Campaign', description: 'New description', rewardPerAction: 20, active: true };

  const response = await request(app).post('/api/v1/campaigns').send(newCampaign).expect(201);

  assert.equal(response.body.name, 'New Campaign');
  assert.equal(response.body.description, 'New description');
  assert.equal(response.body.rewardPerAction, 20);
  assert.equal(response.body.active, true);
  assert.ok(response.body.id);
  assert.ok(response.body.createdAt);
});

test('POST /api/v1/campaigns requires API key when configured', async () => {
  const app = await createTestApp({ apiKeys: 'test-key-123' });
  const newCampaign = { name: 'New Campaign', description: 'New description', rewardPerAction: 20 };

  await request(app).post('/api/v1/campaigns').send(newCampaign).expect(401);

  const response = await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'test-key-123')
    .send(newCampaign)
    .expect(201);

  assert.equal(response.body.name, 'New Campaign');
});

test('POST /api/v1/campaigns validates required fields', async () => {
  const app = await createTestApp();

  const response = await request(app).post('/api/v1/campaigns').send({ description: 'Missing name' }).expect(400);

  assert.equal(response.body.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
  assert.ok(response.body.details.length > 0);
});

test('POST /api/v1/campaigns response shape includes all required fields', async () => {
  const app = await createTestApp();

  const response = await request(app)
    .post('/api/v1/campaigns')
    .send({ name: 'Shape Test', rewardPerAction: 5 })
    .expect(201);

  assert.ok('id' in response.body);
  assert.ok('name' in response.body);
  assert.ok('active' in response.body);
  assert.ok('rewardPerAction' in response.body);
  assert.ok('createdAt' in response.body);
});

// ── PUT ──────────────────────────────────────────────────────────────────────

test('PUT /api/v1/campaigns/:id updates an existing campaign', async () => {
  const app = await createTestApp({ apiKeys: 'test-key-123' });
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  const response = await request(app)
    .put(`/api/v1/campaigns/${campaignId}`)
    .set('X-API-Key', 'test-key-123')
    .send({ name: 'Updated Campaign', rewardPerAction: 30 })
    .expect(200);

  assert.equal(response.body.name, 'Updated Campaign');
  assert.equal(response.body.rewardPerAction, 30);
  assert.equal(response.body.description, 'Test description');
});

test('PUT /api/v1/campaigns/:id returns 404 for non-existent campaign', async () => {
  const app = await createTestApp();
  const response = await request(app).put('/api/v1/campaigns/999').send({ name: 'Updated' }).expect(404);

  assert.equal(response.body.error, 'Campaign not found');
});

test('PUT /api/v1/campaigns/:id requires API key when configured', async () => {
  const app = await createTestApp({ apiKeys: 'test-key-123' });
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  await request(app)
    .put(`/api/v1/campaigns/${campaignId}`)
    .send({ name: 'No Auth Update' })
    .expect(401);
});

test('PUT /api/v1/campaigns/:id partial update preserves unchanged fields', async () => {
  const app = await createTestApp();
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  await request(app).put(`/api/v1/campaigns/${campaignId}`).send({ active: false }).expect(200);

  const getResponse = await request(app).get(`/api/v1/campaigns/${campaignId}`).expect(200);
  assert.equal(getResponse.body.active, false);
  assert.equal(getResponse.body.name, 'Test Campaign');
  assert.equal(getResponse.body.description, 'Test description');
  assert.equal(getResponse.body.rewardPerAction, 10);
});

test('PUT /api/v1/campaigns/:id updating only description preserves all other fields', async () => {
  const app = await createTestApp();
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  const response = await request(app)
    .put(`/api/v1/campaigns/${campaignId}`)
    .send({ description: 'Updated description only' })
    .expect(200);

  assert.equal(response.body.description, 'Updated description only');
  assert.equal(response.body.name, 'Test Campaign');
  assert.equal(response.body.active, true);
  assert.equal(response.body.rewardPerAction, 10);
});

test('PUT /api/v1/campaigns/:id response shape includes all expected fields', async () => {
  const app = await createTestApp();
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  const response = await request(app)
    .put(`/api/v1/campaigns/${campaignId}`)
    .send({ name: 'Shape Check' })
    .expect(200);

  assert.ok('id' in response.body);
  assert.ok('name' in response.body);
  assert.ok('description' in response.body);
  assert.ok('active' in response.body);
  assert.ok('rewardPerAction' in response.body);
  assert.ok('createdAt' in response.body);
});

// ── DELETE ───────────────────────────────────────────────────────────────────

test('DELETE /api/v1/campaigns/:id deletes a campaign', async () => {
  const app = await createTestApp({ apiKeys: 'test-key-123' });
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  await request(app)
    .delete(`/api/v1/campaigns/${campaignId}`)
    .set('X-API-Key', 'test-key-123')
    .expect(204);

  await request(app).get(`/api/v1/campaigns/${campaignId}`).expect(404);
});

test('DELETE /api/v1/campaigns/:id returns 404 for non-existent campaign', async () => {
  const app = await createTestApp();
  const response = await request(app).delete('/api/v1/campaigns/999').expect(404);

  assert.equal(response.body.error, 'Campaign not found');
});

test('DELETE /api/v1/campaigns/:id requires API key when configured', async () => {
  const app = await createTestApp({ apiKeys: 'test-key-123' });
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  await request(app).delete(`/api/v1/campaigns/${campaignId}`).expect(401);
});

test('DELETE /api/v1/campaigns/:id reduces list count', async () => {
  const app = await createTestApp({ apiKeys: 'test-key-123' });

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'test-key-123')
    .send({ name: 'Extra Campaign', rewardPerAction: 5 })
    .expect(201);

  const beforeList = await request(app).get('/api/v1/campaigns').expect(200);
  const beforeCount = beforeList.body.pagination.total;
  const campaignId = beforeList.body.data[0].id;

  await request(app)
    .delete(`/api/v1/campaigns/${campaignId}`)
    .set('X-API-Key', 'test-key-123')
    .expect(204);

  const afterList = await request(app).get('/api/v1/campaigns').expect(200);
  assert.equal(afterList.body.pagination.total, beforeCount - 1);
});

test('DELETE /api/v1/campaigns/:id response has no body', async () => {
  const app = await createTestApp({ apiKeys: 'test-key-123' });
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  const response = await request(app)
    .delete(`/api/v1/campaigns/${campaignId}`)
    .set('X-API-Key', 'test-key-123')
    .expect(204);

  assert.equal(response.text, '');
});

// ── Data integrity ───────────────────────────────────────────────────────────

test('Campaign CRUD operations maintain data integrity', async () => {
  const app = await createTestApp();

  const createResponse = await request(app)
    .post('/api/v1/campaigns')
    .send({ name: 'Integrity Test', description: 'Testing data integrity', rewardPerAction: 15, active: false })
    .expect(201);

  const campaignId = createResponse.body.id;

  const getResponse = await request(app).get(`/api/v1/campaigns/${campaignId}`).expect(200);
  assert.equal(getResponse.body.name, 'Integrity Test');
  assert.equal(getResponse.body.active, false);

  await request(app).put(`/api/v1/campaigns/${campaignId}`).send({ active: true }).expect(200);

  const updatedResponse = await request(app).get(`/api/v1/campaigns/${campaignId}`).expect(200);
  assert.equal(updatedResponse.body.active, true);
  assert.equal(updatedResponse.body.name, 'Integrity Test');
});

// ── Auth & infra ─────────────────────────────────────────────────────────────

test('API key authentication works with Bearer token', async () => {
  const app = await createTestApp({ apiKeys: 'bearer-test-key' });

  await request(app)
    .post('/api/v1/campaigns')
    .set('Authorization', 'Bearer bearer-test-key')
    .send({ name: 'Bearer Auth Test', rewardPerAction: 10 })
    .expect(201);
});

test('Multiple API keys are supported', async () => {
  const app = await createTestApp({ apiKeys: 'key1,key2,key3' });

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'key2')
    .send({ name: 'Multi Key Test', rewardPerAction: 10 })
    .expect(201);
});

test('Rate limiting headers are present', async () => {
  const app = await createTestApp();
  const response = await request(app).get('/api/v1/campaigns').expect(200);

  assert.ok(response.headers['x-ratelimit-limit']);
  assert.ok(response.headers['x-ratelimit-remaining']);
  assert.ok(response.headers['x-ratelimit-reset']);
  assert.ok(response.headers['ratelimit-policy']);
});

test('CORS headers are set correctly', async () => {
  const app = await createTestApp({ corsAllowedOrigins: 'http://localhost:3000' });

  const response = await request(app)
    .get('/api/v1/campaigns')
    .set('Origin', 'http://localhost:3000')
    .expect(200);

  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:3000');
  assert.ok(response.headers['access-control-allow-credentials']);
});

test('Schema version header is present', async () => {
  const app = await createTestApp();
  const response = await request(app).get('/api/v1/campaigns').expect(200);

  assert.ok(response.headers['x-trivela-schema-version']);
  assert.equal(response.headers['x-trivela-schema-version'], '1');
});

test('Legacy /api routes remain functional', async () => {
  const app = await createTestApp();

  const v1Response = await request(app).get('/api/v1/campaigns').expect(200);
  const legacyResponse = await request(app).get('/api/campaigns').expect(200);

  assert.equal(v1Response.body.data.length, legacyResponse.body.data.length);
  assert.equal(v1Response.body.data[0].id, legacyResponse.body.data[0].id);
});
