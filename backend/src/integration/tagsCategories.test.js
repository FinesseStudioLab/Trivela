import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../index.js';

function createTestApp(options = {}) {
  return createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    apiKeys: 'test-key-123',
    ...options,
  });
}

test('GET /api/v1/categories returns category counts', async () => {
  const app = await createTestApp();

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'test-key-123')
    .send({ name: 'DeFi One', rewardPerAction: 1, category: 'DeFi', tags: ['defi'] })
    .expect(201);

  const response = await request(app).get('/api/v1/categories').expect(200);
  assert.ok(Array.isArray(response.body.data));
  assert.ok(response.body.data.some((item) => item.name === 'DeFi' && item.count >= 1));
});

test('GET /api/v1/tags returns tag frequency counts', async () => {
  const app = await createTestApp();

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'test-key-123')
    .send({ name: 'Tagged', rewardPerAction: 1, tags: ['airdrop', 'community'] })
    .expect(201);

  const response = await request(app).get('/api/v1/tags').expect(200);
  assert.ok(Array.isArray(response.body.data));
  assert.ok(response.body.data.some((item) => item.name === 'airdrop'));
});

test('GET /api/v1/campaigns filters by tags and category', async () => {
  const app = await createTestApp();

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'test-key-123')
    .send({ name: 'DeFi Alpha', rewardPerAction: 1, category: 'DeFi', tags: ['defi'] })
    .expect(201);

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'test-key-123')
    .send({ name: 'NFT Beta', rewardPerAction: 1, category: 'NFT', tags: ['nft'] })
    .expect(201);

  const byTag = await request(app).get('/api/v1/campaigns?tags=defi').expect(200);
  assert.equal(byTag.body.data.length, 1);
  assert.equal(byTag.body.data[0].name, 'DeFi Alpha');

  const byCategory = await request(app).get('/api/v1/campaigns?category=NFT').expect(200);
  assert.equal(byCategory.body.data.length, 1);
  assert.equal(byCategory.body.data[0].name, 'NFT Beta');
});
