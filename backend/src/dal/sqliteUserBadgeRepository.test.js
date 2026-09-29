import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteUserBadgeRepository } from './sqliteUserBadgeRepository.js';
import { createAchievementBadgesJob } from '../jobs/achievementBadgesJob.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

async function setup() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return { db, repository: createSqliteUserBadgeRepository({ db }) };
}

function seedProjections(db) {
  const participant = db.prepare('INSERT INTO participants (user, campaign_id) VALUES (?, ?)');
  const credit = db.prepare('INSERT INTO credit_events (user, amount) VALUES (?, ?)');
  const claim = db.prepare('INSERT INTO claim_events (user, amount) VALUES (?, ?)');
  const referral = db.prepare('INSERT INTO referral_credits (referee, referrer) VALUES (?, ?)');

  // GALICE: 5 campaigns, 1,200 points over two credits, one claim
  for (let i = 1; i <= 5; i++) participant.run('GALICE', `c${i}`);
  credit.run('GALICE', '700');
  credit.run('GALICE', '500');
  claim.run('GALICE', '300');

  // GBOB: only appears as a referrer
  referral.run('GREF1', 'GBOB');
  referral.run('GREF2', 'GBOB');

  // GCAROL: one campaign, nothing else
  participant.run('GCAROL', 'c1');
}

test('migrations create the badge tables', async () => {
  const { db } = await setup();
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('user_badges', 'user_milestone_progress')",
    )
    .all()
    .map((r) => r.name)
    .sort();
  assert.deepEqual(tables, ['user_badges', 'user_milestone_progress']);
});

test('listUserMetrics aggregates every projection table, in address order', async () => {
  const { db, repository } = await setup();
  seedProjections(db);

  const rows = repository.listUserMetrics({ limit: 10 });

  assert.deepEqual(rows, [
    {
      user: 'GALICE',
      campaignsJoined: 5,
      creditsReceived: 2,
      pointsEarned: 1200,
      claimsMade: 1,
      referralsMade: 0,
    },
    {
      user: 'GBOB',
      campaignsJoined: 0,
      creditsReceived: 0,
      pointsEarned: 0,
      claimsMade: 0,
      referralsMade: 2,
    },
    {
      user: 'GCAROL',
      campaignsJoined: 1,
      creditsReceived: 0,
      pointsEarned: 0,
      claimsMade: 0,
      referralsMade: 0,
    },
  ]);
});

test('listUserMetrics pages by keyset cursor', async () => {
  const { db, repository } = await setup();
  seedProjections(db);

  const first = repository.listUserMetrics({ limit: 2 });
  const second = repository.listUserMetrics({ afterUser: first[1].user, limit: 2 });

  assert.deepEqual(
    first.map((r) => r.user),
    ['GALICE', 'GBOB'],
  );
  assert.deepEqual(
    second.map((r) => r.user),
    ['GCAROL'],
  );
  assert.deepEqual(repository.listUserMetrics({ afterUser: 'GCAROL', limit: 2 }), []);
});

test('saveResults upserts progress and never duplicates or revokes badges', async () => {
  const { repository } = await setup();
  const metrics = {
    campaignsJoined: 1,
    creditsReceived: 0,
    pointsEarned: 0,
    claimsMade: 0,
    referralsMade: 0,
  };

  const first = repository.saveResults({
    user: 'GA',
    metrics,
    earned: [{ badgeId: 'first_steps', metricValue: 1 }],
    computedAt: '2026-09-29T00:00:00.000Z',
  });
  const second = repository.saveResults({
    user: 'GA',
    metrics: { ...metrics, campaignsJoined: 0 },
    earned: [],
    computedAt: '2026-09-29T01:00:00.000Z',
  });

  assert.equal(first, 1);
  assert.equal(second, 0);
  assert.deepEqual(repository.listBadges('GA'), [
    { badgeId: 'first_steps', metricValue: 1, awardedAt: '2026-09-29T00:00:00.000Z' },
  ]);
  assert.deepEqual(repository.getProgress('GA'), {
    ...metrics,
    campaignsJoined: 0,
    computedAt: '2026-09-29T01:00:00.000Z',
  });
  assert.equal(repository.getProgress('GNOBODY'), null);
});

test('saveResults rolls back the snapshot when a badge insert fails', async () => {
  const { repository } = await setup();

  assert.throws(() =>
    repository.saveResults({
      user: 'GA',
      metrics: {
        campaignsJoined: 1,
        creditsReceived: 0,
        pointsEarned: 0,
        claimsMade: 0,
        referralsMade: 0,
      },
      // An object cannot be bound as a SQLite value, so the insert throws
      // mid-transaction (OR IGNORE would swallow a plain constraint error).
      earned: [{ badgeId: 'first_steps', metricValue: /** @type {any} */ ({}) }],
      computedAt: '2026-09-29T00:00:00.000Z',
    }),
  );
  assert.equal(repository.getProgress('GA'), null);
});

test('job grants badges end-to-end from indexer projections', async () => {
  const { db, repository } = await setup();
  seedProjections(db);
  const job = createAchievementBadgesJob({
    repository,
    batchSize: 2,
    logger: silentLogger,
    now: () => new Date('2026-09-29T12:00:00.000Z'),
  });

  const summary = await job();

  assert.deepEqual(summary, { usersScanned: 3, badgesGranted: 6, failures: 0 });
  assert.deepEqual(
    repository.listBadges('GALICE').map((b) => b.badgeId),
    ['campaign_explorer', 'first_claim', 'first_steps', 'point_collector'],
  );
  assert.deepEqual(
    repository.listBadges('GBOB').map((b) => b.badgeId),
    ['connector'],
  );
  assert.deepEqual(
    repository.listBadges('GCAROL').map((b) => b.badgeId),
    ['first_steps'],
  );

  assert.equal((await job()).badgesGranted, 0);
});
