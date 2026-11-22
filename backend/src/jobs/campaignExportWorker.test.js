import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteExportJobRepository } from '../dal/sqliteExportJobRepository.js';
import { CAMPAIGN_EXPORT_JOB_TYPE, createCampaignExportWorker } from './campaignExportWorker.js';

const silent = { info() {}, warn() {}, error() {} };
const campaignRepository = {
  getById: (id) => (id === 'c1' ? { id: 'c1', name: 'Spring Drop' } : null),
};

async function setup(storageOverrides = {}) {
  const db = new Database(':memory:');
  await runMigrations(db);
  db.exec(`
    INSERT INTO referrals (campaign_id, referrer_address, referee_address, created_at)
    VALUES ('c1', 'GREFERRER', 'GALICE', '2026-09-01T00:00:00Z'),
           ('c1', 'GREFERRER', 'GBOB',   '2026-09-10T00:00:00Z');
    INSERT INTO credit_events (user, amount) VALUES ('GALICE', '10'), ('GBOB', '4');
    INSERT INTO claim_events (user, amount) VALUES ('GALICE', '3');
  `);
  const uploads = [];
  const storage = {
    backendName: 'test',
    async upload(params) {
      uploads.push(params);
      return { url: `https://files.test/${params.filename}`, key: params.filename };
    },
    ...storageOverrides,
  };
  const repository = createSqliteExportJobRepository({ db });
  const worker = createCampaignExportWorker({
    db,
    repository,
    campaignRepository,
    storage,
    logger: silent,
  });
  return { db, repository, worker, uploads };
}

test('exposes a stable job type', () => {
  assert.equal(CAMPAIGN_EXPORT_JOB_TYPE, 'campaign_export');
});

test('builds a CSV, uploads it, and marks the job completed with a download URL', async () => {
  const { repository, worker, uploads } = await setup();
  const job = repository.create({ campaignId: 'c1', format: 'csv' });
  assert.equal(job.status, 'queued');

  await worker.handle({ exportJobId: job.id });

  const done = repository.getById(job.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.rowCount, 2);
  assert.equal(done.fileUrl, `https://files.test/exports/campaigns/c1/${job.id}.csv`);
  assert.ok(done.completedAt);

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].mimeType, 'text/csv; charset=utf-8');
  const csv = uploads[0].buffer.toString('utf8');
  assert.match(
    csv,
    /^participantAddress,registeredAt,pointsCredited,pointsClaimed,netPoints,referredBy\n/,
  );
  assert.match(csv, /GALICE/);
  assert.match(csv, /GBOB/);
});

test('supports JSON output and reports per-participant point totals', async () => {
  const { repository, worker, uploads } = await setup();
  const job = repository.create({
    campaignId: 'c1',
    format: 'json',
    fromDate: '2026-09-05T00:00:00Z',
  });
  assert.equal(repository.getById(job.id).fromDate, '2026-09-05T00:00:00Z');

  await worker.handle({ exportJobId: job.id });

  const body = JSON.parse(uploads[0].buffer.toString('utf8'));
  assert.deepEqual(body.campaign, { id: 'c1', name: 'Spring Drop' });
  const alice = body.participants.find((p) => p.participantAddress === 'GALICE');
  assert.equal(alice.pointsCredited, 10);
  assert.equal(alice.pointsClaimed, 3);
  assert.equal(alice.netPoints, 7);
  assert.equal(uploads[0].mimeType, 'application/json; charset=utf-8');
  assert.equal(repository.getById(job.id).rowCount, 2);
});

test('a redelivered, already-completed job is a no-op', async () => {
  const { repository, worker, uploads } = await setup();
  const job = repository.create({ campaignId: 'c1', format: 'csv' });
  await worker.handle({ exportJobId: job.id });
  await worker.handle({ exportJobId: job.id });
  assert.equal(uploads.length, 1);
});

test('an unknown job id is dropped without throwing', async () => {
  const { worker } = await setup();
  await worker.handle({ exportJobId: 'nope' });
});

test('upload failure marks the job failed and rethrows so the queue can retry', async () => {
  const { repository, worker } = await setup({
    async upload() {
      throw new Error('storage down');
    },
  });
  const job = repository.create({ campaignId: 'c1', format: 'csv' });

  await assert.rejects(() => worker.handle({ exportJobId: job.id }), /storage down/);

  const failed = repository.getById(job.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'storage down');
  assert.equal(failed.attempts, 1);
});

test('a retry after failure moves the job back to running and can complete', async () => {
  let fail = true;
  const { repository, worker } = await setup({
    async upload(params) {
      if (fail) throw new Error('flaky');
      return { url: `https://files.test/${params.filename}`, key: params.filename };
    },
  });
  const job = repository.create({ campaignId: 'c1', format: 'csv' });
  await assert.rejects(() => worker.handle({ exportJobId: job.id }));

  fail = false;
  await worker.handle({ exportJobId: job.id });

  const done = repository.getById(job.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.error, null);
  assert.equal(done.attempts, 2);
});

test('a campaign deleted after queueing fails the job', async () => {
  const { repository, worker } = await setup();
  const job = repository.create({ campaignId: 'gone', format: 'csv' });
  await assert.rejects(() => worker.handle({ exportJobId: job.id }), /no longer exists/);
  assert.equal(repository.getById(job.id).status, 'failed');
});
