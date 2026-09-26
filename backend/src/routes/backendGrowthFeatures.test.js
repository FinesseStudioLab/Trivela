// @ts-check
/**
 * Integration tests for the fraud review API (#1258), operator deposit API
 * (#1261) and the generated API docs (#1259).
 * Run with: node --test src/routes/backendGrowthFeatures.test.js
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../index.js';

const API_KEY = 'test-key-123';
const MASTER = 'test-master-key';

function makeApp(options = {}) {
  return createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    rateLimit: { windowMs: 60_000, maxRequests: 10_000 },
    apiKeys: API_KEY,
    masterKey: MASTER,
    fraudSubnetThreshold: 3,
    ...options,
  });
}

async function createCampaign(app) {
  const res = await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', API_KEY)
    .send({ name: 'Growth', rewardPerAction: 1 })
    .expect(201);
  return res.body;
}

// ── #1258 fraud detection ────────────────────────────────────────────────────

test('referrals from one IP subnet raise a fraud flag that admins can review', async () => {
  const app = await makeApp();
  const campaign = await createCampaign(app);

  // Every supertest request comes from the same loopback address, i.e. one subnet.
  for (const referee of ['GREF1', 'GREF2', 'GREF3']) {
    await request(app)
      .post(`/api/v1/campaigns/${campaign.id}/referrals`)
      .send({ referrerAddress: 'GREFERRER', refereeAddress: referee })
      .expect(201);
  }

  const flags = await request(app)
    .get('/api/v1/admin/fraud/flags?status=open')
    .set('X-API-Key', MASTER)
    .expect(200);
  assert.equal(flags.body.total, 1);
  const [flag] = flags.body.data;
  assert.equal(flag.rule, 'ip_subnet_cluster');
  assert.equal(flag.accountCount, 3);
  assert.deepEqual(flag.accounts.sort(), ['GREF1', 'GREF2', 'GREF3']);

  const dismissed = await request(app)
    .patch(`/api/v1/admin/fraud/flags/${flag.id}`)
    .set('X-API-Key', MASTER)
    .send({ status: 'dismissed' })
    .expect(200);
  assert.equal(dismissed.body.status, 'dismissed');

  const open = await request(app)
    .get('/api/v1/admin/fraud/flags?status=open')
    .set('X-API-Key', MASTER);
  assert.equal(open.body.total, 0);
});

test('flagging never blocks a signup and stays quiet below the threshold', async () => {
  const app = await makeApp();
  const campaign = await createCampaign(app);

  for (const referee of ['GA', 'GB']) {
    await request(app)
      .post(`/api/v1/campaigns/${campaign.id}/referrals`)
      .send({ referrerAddress: 'GREFERRER', refereeAddress: referee })
      .expect(201);
  }
  const flags = await request(app)
    .get('/api/v1/admin/fraud/flags')
    .set('X-API-Key', MASTER)
    .expect(200);
  assert.equal(flags.body.total, 0);
});

test('fraud admin API validates input, 404s unknown flags, and requires the master key', async () => {
  const app = await makeApp();

  await request(app).get('/api/v1/admin/fraud/flags').set('X-API-Key', API_KEY).expect(401);
  await request(app)
    .get('/api/v1/admin/fraud/flags?status=bogus')
    .set('X-API-Key', MASTER)
    .expect(400);
  await request(app)
    .patch('/api/v1/admin/fraud/flags/999')
    .set('X-API-Key', MASTER)
    .send({ status: 'confirmed' })
    .expect(404);
  await request(app)
    .patch('/api/v1/admin/fraud/flags/1')
    .set('X-API-Key', MASTER)
    .send({ status: 'nonsense' })
    .expect(400);
});

// ── #1261 Horizon deposit watcher ────────────────────────────────────────────

test('operator deposit API exposes watcher status and deposit lookups behind the master key', async () => {
  const app = await makeApp({ operatorDepositAccounts: 'GCUSTODY' });

  await request(app).get('/api/v1/operator/deposits').set('X-API-Key', API_KEY).expect(401);

  const status = await request(app)
    .get('/api/v1/operator/watcher/status')
    .set('X-API-Key', MASTER)
    .expect(200);
  assert.equal(status.body.running, false, 'the stream is not opened when jobs are disabled');
  assert.equal(status.body.depositsRecorded, 0);

  const list = await request(app)
    .get('/api/v1/operator/deposits')
    .set('X-API-Key', MASTER)
    .expect(200);
  assert.deepEqual(list.body, { data: [], total: 0 });

  await request(app)
    .get('/api/v1/operator/deposits/unknown-tx')
    .set('X-API-Key', MASTER)
    .expect(404);
});

// ── #1259 API docs ───────────────────────────────────────────────────────────

test('GET /docs/api serves Swagger UI', async () => {
  const app = await makeApp();
  const res = await request(app).get('/docs/api/').expect(200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.text, /swagger-ui/i);
});

test('GET /docs/api/openapi.json serves the generated OpenAPI 3.0 document', async () => {
  const app = await makeApp();
  const res = await request(app).get('/docs/api/openapi.json').expect(200);

  assert.match(res.body.openapi, /^3\.[01]\./);
  assert.ok(Object.keys(res.body.paths).length > 0, 'includes the documented paths');
  assert.ok(res.body.components.schemas.CampaignCreate, 'includes schemas generated from Zod');
  assert.ok(res.body.components.schemas.Claim);
});

test('the existing /docs Swagger UI keeps working', async () => {
  const app = await makeApp();
  await request(app).get('/docs/').expect(200);
});
