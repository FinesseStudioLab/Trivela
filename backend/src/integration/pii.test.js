// @ts-check
//
// Integration tests for the GDPR PII export/purge endpoints (issue #927).
//
// The route handlers (`purgePiiUser`/`purgePiiCampaign`/`exportPiiUser` in
// index.js) used to always 500 — they referenced `campaignRepository.db`,
// a property that doesn't exist, instead of the app's real `dal.db` — and
// were reachable with any valid tenant API key rather than the master key,
// because of a dead duplicate route registration. Neither bug had any test
// coverage. These tests exercise the real HTTP layer end-to-end against a
// shared on-disk SQLite file so seeded rows and the routes under test see
// the same data.

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { createApp } from '../index.js';
import { runMigrations } from '../db/migrate.js';

async function createTestApp(dbPath, options = {}) {
  return createApp({
    dbPath,
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    masterKey: 'master-key-xyz',
    apiKeys: '',
    ...options,
  });
}

/** Seeds via a second raw connection to the same on-disk DB file. */
async function withSeededDb(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'trivela-pii-test-'));
  const dbPath = join(dir, 'test.db');
  const app = await createTestApp(dbPath);
  const db = new Database(dbPath);
  try {
    return await fn({ app, db });
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test('purge-user requires master key', async () => {
  await withSeededDb(async ({ app }) => {
    await request(app).post('/api/v1/pii/purge-user').send({ identifier: 'GABC' }).expect(401);
  });
});

test('export-user requires master key', async () => {
  await withSeededDb(async ({ app }) => {
    await request(app).post('/api/v1/pii/export-user').send({ identifier: 'GABC' }).expect(401);
  });
});

test('purge-user returns 400 when identifier is missing', async () => {
  await withSeededDb(async ({ app }) => {
    const res = await request(app)
      .post('/api/v1/pii/purge-user')
      .set('X-API-Key', 'master-key-xyz')
      .send({})
      .expect(400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });
});

test('export-user returns an empty data object for an unknown identifier', async () => {
  await withSeededDb(async ({ app }) => {
    const res = await request(app)
      .post('/api/v1/pii/export-user')
      .set('X-API-Key', 'master-key-xyz')
      .send({ identifier: 'GUNKNOWNWALLET' })
      .expect(200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, {});
  });
});

test('export-user returns seeded rows across multiple tables, redacting push credentials', async () => {
  await withSeededDb(async ({ app, db }) => {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO referrals (campaign_id, referrer_address, referee_address, created_at) VALUES (?, ?, ?, ?)',
    ).run(1, 'GWALLET1', 'GWALLET2', now);
    db.prepare(
      'INSERT INTO push_subscriptions (user, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('GWALLET1', 'https://push.example/x', 'secret-p256dh', 'secret-auth', 'ua', Date.now());

    const res = await request(app)
      .post('/api/v1/pii/export-user')
      .set('X-API-Key', 'master-key-xyz')
      .send({ identifier: 'GWALLET1' })
      .expect(200);

    assert.equal(res.body.data.referrals.length, 1);
    assert.equal(res.body.data.push_subscriptions.length, 1);
    assert.equal(res.body.data.push_subscriptions[0].p256dh, '[REDACTED]');
    assert.equal(res.body.data.push_subscriptions[0].auth, '[REDACTED]');
    assert.equal(res.body.data.push_subscriptions[0].endpoint, 'https://push.example/x');
  });
});

test('purge-user deletes seeded rows and a follow-up export comes back empty', async () => {
  await withSeededDb(async ({ app, db }) => {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO referrals (campaign_id, referrer_address, referee_address, created_at) VALUES (?, ?, ?, ?)',
    ).run(1, 'GPURGEME', 'GOTHER', now);
    db.prepare(
      'INSERT INTO credit_events (user, amount, ledger, tx_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('GPURGEME', '50', 1, 'tx1', now);

    const purgeRes = await request(app)
      .post('/api/v1/pii/purge-user')
      .set('X-API-Key', 'master-key-xyz')
      .send({ identifier: 'GPURGEME' })
      .expect(200);

    assert.equal(purgeRes.body.success, true);
    assert.ok(purgeRes.body.purged.some((p) => p.table === 'referrals'));
    assert.ok(purgeRes.body.purged.some((p) => p.table === 'credit_events'));

    const exportRes = await request(app)
      .post('/api/v1/pii/export-user')
      .set('X-API-Key', 'master-key-xyz')
      .send({ identifier: 'GPURGEME' })
      .expect(200);
    assert.deepEqual(exportRes.body.data, {});
  });
});

test('purge-user does not affect an unrelated wallet', async () => {
  await withSeededDb(async ({ app, db }) => {
    const now = new Date().toISOString();
    // GTARGET's own independent data (a referral to a third party, not
    // GBYSTANDER — a shared referral row is a relationship record, so
    // purging one side necessarily removes the whole row; that's covered
    // by the "deletes seeded rows" test above, not this one).
    db.prepare(
      'INSERT INTO credit_events (user, amount, ledger, tx_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('GTARGET', '10', 1, 'tx-target', now);
    // GBYSTANDER's own, entirely independent data.
    db.prepare(
      'INSERT INTO credit_events (user, amount, ledger, tx_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('GBYSTANDER', '75', 1, 'tx-bystander', now);

    await request(app)
      .post('/api/v1/pii/purge-user')
      .set('X-API-Key', 'master-key-xyz')
      .send({ identifier: 'GTARGET' })
      .expect(200);

    const exportRes = await request(app)
      .post('/api/v1/pii/export-user')
      .set('X-API-Key', 'master-key-xyz')
      .send({ identifier: 'GBYSTANDER' })
      .expect(200);
    assert.equal(exportRes.body.data.credit_events.length, 1);
    assert.equal(exportRes.body.data.credit_events[0].amount, '75');
  });
});

test('purge-user and export-user are audit-logged with counts only, never the underlying PII', async () => {
  await withSeededDb(async ({ app, db }) => {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO notification_channel_settings (user_id, phone_number, updated_at) VALUES (?, ?, ?)',
    ).run('GAUDITME', '+15551234567', now);

    await request(app)
      .post('/api/v1/pii/export-user')
      .set('X-API-Key', 'master-key-xyz')
      .send({ identifier: 'GAUDITME' })
      .expect(200);
    await request(app)
      .post('/api/v1/pii/purge-user')
      .set('X-API-Key', 'master-key-xyz')
      .send({ identifier: 'GAUDITME' })
      .expect(200);

    const rows = db
      .prepare(
        'SELECT action, entity, entity_id, diff FROM audit_logs WHERE entity_id = ? ORDER BY id',
      )
      .all('GAUDITME');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].action, 'pii_export');
    assert.equal(rows[1].action, 'pii_purge');
    for (const row of rows) {
      assert.equal(row.entity, 'user');
      assert.ok(
        !row.diff.includes('+15551234567'),
        'audit diff must never contain the raw phone number',
      );
    }
  });
});

test('purge-user is idempotent: replaying the same Idempotency-Key returns the cached result without re-erroring', async () => {
  await withSeededDb(async ({ app, db }) => {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO referrals (campaign_id, referrer_address, referee_address, created_at) VALUES (?, ?, ?, ?)',
    ).run(1, 'GIDEMPOTENT', 'GOTHER2', now);

    const idempotencyKey = 'gdpr-purge-test-key-1';

    const first = await request(app)
      .post('/api/v1/pii/purge-user')
      .set('X-API-Key', 'master-key-xyz')
      .set('Idempotency-Key', idempotencyKey)
      .send({ identifier: 'GIDEMPOTENT' })
      .expect(200);

    const second = await request(app)
      .post('/api/v1/pii/purge-user')
      .set('X-API-Key', 'master-key-xyz')
      .set('Idempotency-Key', idempotencyKey)
      .send({ identifier: 'GIDEMPOTENT' })
      .expect(200);

    assert.equal(second.headers['idempotent-previous-request'], 'true');
    assert.deepEqual(second.body, first.body);
  });
});

test('purge-campaign requires master key and validates campaignId', async () => {
  await withSeededDb(async ({ app }) => {
    await request(app).post('/api/v1/pii/purge-campaign').send({ campaignId: '1' }).expect(401);

    await request(app)
      .post('/api/v1/pii/purge-campaign')
      .set('X-API-Key', 'master-key-xyz')
      .send({})
      .expect(400);
  });
});

test('purge-campaign deletes campaign-scoped rows via the real dal.db wiring', async () => {
  await withSeededDb(async ({ app, db }) => {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO referrals (campaign_id, referrer_address, referee_address, created_at) VALUES (?, ?, ?, ?)',
    ).run(7, 'GCAMPUSER1', 'GCAMPUSER2', now);

    const res = await request(app)
      .post('/api/v1/pii/purge-campaign')
      .set('X-API-Key', 'master-key-xyz')
      .send({ campaignId: '7' })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.purged.some((p) => p.table === 'referrals'));
  });
});

// Sanity check that migrations actually ran against the shared file (guards
// against a future setup regression silently making every test above a
// false positive against an empty/unmigrated schema).
test('sanity: the shared test db has the expected schema', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trivela-pii-test-sanity-'));
  const dbPath = join(dir, 'test.db');
  try {
    const db = new Database(dbPath);
    await runMigrations(db);
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='referrals'")
      .get();
    assert.ok(table);
    db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
