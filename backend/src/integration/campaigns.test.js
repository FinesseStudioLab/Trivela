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

test('POST /api/v1/campaigns creates a new campaign without API key when not configured', async () => {
  const app = await createTestApp();
  const newCampaign = {
    name: 'New Campaign',
    description: 'New description',
    rewardPerAction: 20,
    active: true,
  };

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
  const newCampaign = {
    name: 'New Campaign',
    description: 'New description',
    rewardPerAction: 20,
  };

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
  const invalidCampaign = {
    description: 'Missing name and rewardPerAction',
  };

  const response = await request(app).post('/api/v1/campaigns').send(invalidCampaign).expect(400);

  assert.equal(response.body.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(response.body.details));
  assert.ok(response.body.details.length > 0);
});

test('PUT /api/v1/campaigns/:id updates an existing campaign', async () => {
  const app = await createTestApp({ apiKeys: 'test-key-123' });
  const listResponse = await request(app).get('/api/v1/campaigns');
  const campaignId = listResponse.body.data[0].id;

  const updates = {
    name: 'Updated Campaign',
    rewardPerAction: 30,
  };

  const response = await request(app)
    .put(`/api/v1/campaigns/${campaignId}`)
    .set('X-API-Key', 'test-key-123')
    .send(updates)
    .expect(200);

  assert.equal(response.body.name, 'Updated Campaign');
  assert.equal(response.body.rewardPerAction, 30);
  assert.equal(response.body.description, 'Test description');
});

test('PUT /api/v1/campaigns/:id returns 404 for non-existent campaign', async () => {
  const app = await createTestApp();
  const updates = { name: 'Updated' };

  const response = await request(app).put('/api/v1/campaigns/999').send(updates).expect(404);

  assert.equal(response.body.error, 'Campaign not found');
});

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

test('Campaign CRUD operations maintain data integrity', async () => {
  const app = await createTestApp();

  const createResponse = await request(app)
    .post('/api/v1/campaigns')
    .send({
      name: 'Integrity Test',
      description: 'Testing data integrity',
      rewardPerAction: 15,
      active: false,
    })
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

test('API key authentication works with Bearer token', async () => {
  const app = await createTestApp({ apiKeys: 'bearer-test-key' });

  await request(app)
    .post('/api/v1/campaigns')
    .set('Authorization', 'Bearer bearer-test-key')
    .send({
      name: 'Bearer Auth Test',
      rewardPerAction: 10,
    })
    .expect(201);
});

test('Multiple API keys are supported', async () => {
  const app = await createTestApp({ apiKeys: 'key1,key2,key3' });

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'key2')
    .send({
      name: 'Multi Key Test',
      rewardPerAction: 10,
    })
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
  const app = await createTestApp({
    corsAllowedOrigins: 'http://localhost:3000',
  });

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
