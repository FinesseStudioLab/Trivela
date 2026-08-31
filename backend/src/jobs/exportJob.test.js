import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createExportJob } from './exportJob.js';

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

function makeStorage() {
  /** @type {Map<string, { buffer: Buffer, mimeType: string }>} */
  const uploads = new Map();
  return {
    backendName: 'local',
    uploads,
    async upload({ buffer, filename, mimeType }) {
      uploads.set(filename, { buffer, mimeType });
      return { url: `http://local/${filename}`, key: filename };
    },
  };
}

async function setup() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return db;
}

test('exportJob: exports empty DB — manifest uploaded, checkpoint recorded', async () => {
  const db = await setup();
  const storage = makeStorage();
  const job = createExportJob({ db, storage, logger: silentLogger() });
  const date = '2024-01-15';

  await job.run(date);

  // Manifest must be present
  assert.ok(storage.uploads.has(`exports/dt=${date}/manifest.json`), 'manifest uploaded');

  const manifestEntry = storage.uploads.get(`exports/dt=${date}/manifest.json`);
  const manifest = JSON.parse(manifestEntry.buffer.toString('utf8'));
  assert.equal(manifest.schemaVersion, '1');
  assert.equal(manifest.asOfDate, date);
  assert.ok(Array.isArray(manifest.files), 'files is array');
  // All tables have rowCount 0 for empty DB
  for (const f of manifest.files) {
    assert.equal(f.rowCount, 0, `${f.table} should have rowCount 0`);
    assert.ok(f.checksum, `${f.table} should have checksum`);
  }

  // Checkpoint recorded
  const checkpoint = db.prepare('SELECT * FROM export_checkpoints WHERE date = ?').get(date);
  assert.ok(checkpoint, 'checkpoint should be recorded');
});

test('exportJob: seeded campaigns — CSV has correct headers and rows', async () => {
  const db = await setup();
  // Insert a test campaign
  db.prepare(
    `
    INSERT INTO campaigns (id, name, slug, description, active, reward_per_action, created_at, updated_at)
    VALUES (1, 'Test Campaign', 'test-campaign', 'desc', 1, 100, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
  `,
  ).run();

  const storage = makeStorage();
  const job = createExportJob({ db, storage, logger: silentLogger() });
  const date = '2024-01-15';

  await job.run(date);

  const csvEntry = storage.uploads.get(`exports/dt=${date}/campaigns.csv`);
  assert.ok(csvEntry, 'campaigns CSV should be uploaded');
  const csv = csvEntry.buffer.toString('utf8');
  const lines = csv.trim().split('\n');
  assert.ok(lines.length >= 2, 'CSV should have header + at least one data row');
  assert.ok(lines[0].includes('name'), 'header should include name column');
  assert.ok(csv.includes('Test Campaign'), 'CSV should include campaign name');

  // Verify checksum in manifest matches independent computation
  const manifestEntry = storage.uploads.get(`exports/dt=${date}/manifest.json`);
  const manifest = JSON.parse(manifestEntry.buffer.toString('utf8'));
  const campaignFile = manifest.files.find((f) => f.table === 'campaigns');
  assert.ok(campaignFile, 'campaigns entry in manifest');
  const expectedChecksum = createHash('sha256').update(csvEntry.buffer).digest('hex');
  assert.equal(campaignFile.checksum, expectedChecksum, 'checksum must match');
  assert.equal(campaignFile.rowCount, 1);
});

test('exportJob: second run for same date is skipped (idempotent)', async () => {
  const db = await setup();
  const storage = makeStorage();
  const job = createExportJob({ db, storage, logger: silentLogger() });
  const date = '2024-02-01';

  await job.run(date);
  const uploadCountAfterFirst = storage.uploads.size;

  // Second run
  await job.run(date);
  assert.equal(
    storage.uploads.size,
    uploadCountAfterFirst,
    'no new uploads on second run for same date',
  );
});

test('exportJob: missing on-chain tables produce empty CSVs without crashing', async () => {
  const db = await setup();
  // Do NOT create credit_events, claim_events etc — they are not in migrations
  const storage = makeStorage();
  const job = createExportJob({ db, storage, logger: silentLogger() });

  await assert.doesNotReject(() => job.run('2024-03-01'), 'should not throw for missing tables');

  const manifest = JSON.parse(
    storage.uploads.get('exports/dt=2024-03-01/manifest.json').buffer.toString('utf8'),
  );
  const missingTable = manifest.files.find((f) => f.table === 'credit_events');
  assert.ok(missingTable, 'credit_events entry present in manifest');
  assert.equal(missingTable.rowCount, 0, 'missing table has rowCount 0');
});

test('exportJob: CSV cells with comma, quote, and newline are correctly escaped', async () => {
  const db = await setup();
  // Insert campaign with special characters in name
  db.prepare(
    `
    INSERT INTO campaigns (id, name, slug, description, active, reward_per_action, created_at, updated_at)
    VALUES (1, 'Name, with "quotes"', 'special-name', 'line1\nline2', 1, 0, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
  `,
  ).run();

  const storage = makeStorage();
  const job = createExportJob({ db, storage, logger: silentLogger() });
  await job.run('2024-04-01');

  const csv = storage.uploads.get('exports/dt=2024-04-01/campaigns.csv').buffer.toString('utf8');
  // Name contains comma and quotes — must be double-quoted with escaped inner quotes
  assert.ok(csv.includes('"Name, with ""quotes"""'), 'comma+quote cell is RFC 4180 escaped');
  // Description contains newline — must be wrapped in quotes
  assert.ok(csv.includes('"line1\nline2"'), 'newline cell is quoted');
});
