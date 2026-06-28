// PostgreSQL repository integration tests (issue #284).
//
// Skipped when `TEST_DATABASE_URL` is not set so the default `npm test` flow
// on a clean checkout (no PG container) stays green. To run locally:
//
//   docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=trivela --name trivela-pg postgres:16-alpine
//   TEST_DATABASE_URL=postgres://postgres:trivela@localhost:55432/postgres \
//     node --test src/dal/pg/pgCampaignRepository.test.js
//
// CI uses the `postgres` service in `compose.yaml`.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createPool, isPostgresUrl } from './pgClient.js';
import { runPgMigrations } from './migrate.js';
import { createPgCampaignRepository } from './pgCampaignRepository.js';
import { createPgAuditLogRepository } from './pgAuditLogRepository.js';
import { assertCampaignRepository } from '../campaignRepository.js';
import { assertAuditLogRepository } from '../auditLogRepository.js';

const URL = process.env.TEST_DATABASE_URL;
const SKIP = !URL ? { skip: 'TEST_DATABASE_URL not set' } : {};

async function setup() {
  const pool = createPool(URL);
  await pool.query('DROP TABLE IF EXISTS campaigns, audit_logs, _schema_migrations CASCADE');
  await runPgMigrations(pool);
  return {
    pool,
    campaigns: createPgCampaignRepository({ pool }),
    auditLogs: createPgAuditLogRepository({ pool }),
  };
}

test('pgCampaignRepository satisfies the campaign repository interface', SKIP, async () => {
  const { pool, campaigns } = await setup();
  try {
    assertCampaignRepository(campaigns);
  } finally {
    await pool.end();
  }
});

test('pgCampaignRepository CRUD round-trips', SKIP, async () => {
  const { pool, campaigns } = await setup();
  try {
    const created = await campaigns.create({
      name: 'Test Campaign',
      description: 'demo',
      rewardPerAction: 5,
      tags: ['AlphA', 'beta'],
      category: 'DeFi',
    });
    assert.equal(created.name, 'Test Campaign');
    assert.equal(created.rewardPerAction, 5);
    assert.deepEqual(created.tags, ['alpha', 'beta']);

    const fetched = await campaigns.getById(created.id);
    assert.equal(fetched?.slug, created.slug);

    const updated = await campaigns.update(created.id, { rewardPerAction: 10 });
    assert.equal(updated?.rewardPerAction, 10);

    const removed = await campaigns.delete(created.id);
    assert.equal(removed, true);
    assert.equal(await campaigns.getById(created.id), undefined);
  } finally {
    await pool.end();
  }
});

test('pgCampaignRepository list filters by tags + category', SKIP, async () => {
  const { pool, campaigns } = await setup();
  try {
    await campaigns.create({ name: 'A', tags: ['x'], category: 'DeFi' });
    await campaigns.create({ name: 'B', tags: ['y'], category: 'NFT' });

    const defi = await campaigns.list({ category: 'DeFi' });
    assert.equal(defi.length, 1);
    assert.equal(defi[0].name, 'A');

    const taggedX = await campaigns.list({ tags: ['X'] });
    assert.equal(taggedX.length, 1);
    assert.equal(taggedX[0].name, 'A');
  } finally {
    await pool.end();
  }
});

test('pgAuditLogRepository creates and lists entries', SKIP, async () => {
  const { pool, auditLogs } = await setup();
  try {
    assertAuditLogRepository(auditLogs);

    const entry = await auditLogs.create({
      actor: 'GABC',
      action: 'update',
      entity: 'campaign',
      entityId: '42',
      diff: { name: ['old', 'new'] },
    });
    assert.equal(entry.actor, 'GABC');
    assert.deepEqual(entry.diff, { name: ['old', 'new'] });

    const all = await auditLogs.list({ entity: 'campaign' });
    assert.equal(all.length, 1);
    const none = await auditLogs.list({ entity: 'other' });
    assert.equal(none.length, 0);
  } finally {
    await pool.end();
  }
});

test('isPostgresUrl recognises both URL prefixes', () => {
  // Pure-function test — runs without TEST_DATABASE_URL.
  assert.equal(isPostgresUrl('postgres://u:p@h/d'), true);
  assert.equal(isPostgresUrl('postgresql://u:p@h/d'), true);
  assert.equal(isPostgresUrl('sqlite:///tmp/foo.db'), false);
  assert.equal(isPostgresUrl(undefined), false);
  assert.equal(isPostgresUrl(''), false);
});
