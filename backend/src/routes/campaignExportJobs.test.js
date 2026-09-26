// @ts-check
/**
 * Integration tests for #1260 — asynchronous campaign exports.
 * Run with: node --test src/routes/campaignExportJobs.test.js
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../index.js';

const API_KEY = 'test-key-123';

function makeStorage() {
  /** @type {Array<{ filename: string, buffer: Buffer }>} */
  const uploads = [];
  return {
    backendName: 'test',
    uploads,
    async upload({ buffer, filename }) {
      uploads.push({ filename, buffer });
      return { url: `https://files.test/${filename}`, key: filename };
    },
  };
}

async function makeApp(options = {}) {
  const storage = makeStorage();
  const app = await createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    rateLimit: { windowMs: 60_000, maxRequests: 10_000 },
    apiKeys: API_KEY,
    storageAdapter: storage,
    ...options,
  });
  return { app, storage };
}

let campaignSeq = 0;
async function createCampaign(app) {
  const res = await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', API_KEY)
    .send({ name: `Export Me ${++campaignSeq}`, rewardPerAction: 1 })
    .expect(201);
  return res.body;
}

async function waitForStatus(app, url, wanted, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    const res = await request(app).get(url).set('X-API-Key', API_KEY);
    if (res.body.status === wanted) return res.body;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`export job never reached status "${wanted}"`);
}

test('POST /campaigns/:id/exports returns 202 immediately and the job completes in the background', async () => {
  const { app, storage } = await makeApp();
  const campaign = await createCampaign(app);

  const res = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/exports`)
    .set('X-API-Key', API_KEY)
    .send({ format: 'csv' })
    .expect(202);

  assert.equal(res.body.status, 'queued');
  assert.equal(res.body.format, 'csv');
  assert.equal(res.body.downloadUrl, null);
  assert.ok(res.body.jobId);
  assert.equal(res.body.statusUrl, `/api/v1/campaigns/${campaign.id}/exports/${res.body.jobId}`);

  const done = await waitForStatus(app, res.body.statusUrl, 'completed');
  assert.equal(
    done.downloadUrl,
    `https://files.test/exports/campaigns/${campaign.id}/${res.body.jobId}.csv`,
  );
  assert.equal(done.rowCount, 0);
  assert.equal(storage.uploads.length, 1);
  assert.match(storage.uploads[0].buffer.toString('utf8'), /^participantAddress,/);
});

test('exports default to CSV and list newest first', async () => {
  const { app } = await makeApp();
  const campaign = await createCampaign(app);

  const first = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/exports`)
    .set('X-API-Key', API_KEY)
    .send({})
    .expect(202);
  assert.equal(first.body.format, 'csv');
  const second = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/exports`)
    .set('X-API-Key', API_KEY)
    .send({ format: 'JSON' })
    .expect(202);

  const list = await request(app)
    .get(`/api/v1/campaigns/${campaign.id}/exports`)
    .set('X-API-Key', API_KEY)
    .expect(200);
  assert.equal(list.body.total, 2);
  assert.equal(list.body.data[0].jobId, second.body.jobId);
  assert.equal(list.body.data[0].format, 'json');
});

test('validates format and date inputs', async () => {
  const { app } = await makeApp();
  const campaign = await createCampaign(app);
  const post = (body) =>
    request(app)
      .post(`/api/v1/campaigns/${campaign.id}/exports`)
      .set('X-API-Key', API_KEY)
      .send(body);

  assert.equal((await post({ format: 'xml' }).expect(400)).body.code, 'INVALID_FORMAT');
  assert.equal((await post({ from: 'yesterday-ish' }).expect(400)).body.code, 'VALIDATION_ERROR');
  assert.equal((await post({ to: 123 }).expect(400)).body.code, 'VALIDATION_ERROR');
  await post({ from: '2026-01-01', to: '2026-12-31' }).expect(202);
});

test('unknown campaigns and jobs return 404; jobs are scoped to their campaign', async () => {
  const { app } = await makeApp();
  const campaign = await createCampaign(app);
  const other = await createCampaign(app);

  await request(app)
    .post('/api/v1/campaigns/missing/exports')
    .set('X-API-Key', API_KEY)
    .send({})
    .expect(404);
  await request(app).get('/api/v1/campaigns/missing/exports').set('X-API-Key', API_KEY).expect(404);

  const job = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/exports`)
    .set('X-API-Key', API_KEY)
    .send({})
    .expect(202);

  await request(app)
    .get(`/api/v1/campaigns/${campaign.id}/exports/does-not-exist`)
    .set('X-API-Key', API_KEY)
    .expect(404);
  await request(app)
    .get(`/api/v1/campaigns/${other.id}/exports/${job.body.jobId}`)
    .set('X-API-Key', API_KEY)
    .expect(404);
});

test('requires an API key', async () => {
  const { app } = await makeApp();
  const campaign = await createCampaign(app);
  await request(app).post(`/api/v1/campaigns/${campaign.id}/exports`).send({}).expect(401);
  await request(app).get(`/api/v1/campaigns/${campaign.id}/exports`).expect(401);
});

test('a failing upload surfaces as a failed job with the error message', async () => {
  const { app } = await makeApp({
    storageAdapter: {
      backendName: 'broken',
      async upload() {
        throw new Error('bucket unavailable');
      },
    },
  });
  const campaign = await createCampaign(app);
  const res = await request(app)
    .post(`/api/v1/campaigns/${campaign.id}/exports`)
    .set('X-API-Key', API_KEY)
    .send({})
    .expect(202);

  const failed = await waitForStatus(app, res.body.statusUrl, 'failed');
  assert.equal(failed.error, 'bucket unavailable');
  assert.equal(failed.downloadUrl, null);
});
