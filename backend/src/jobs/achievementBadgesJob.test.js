import assert from 'node:assert/strict';
import test from 'node:test';
import { createAchievementBadgesJob } from './achievementBadgesJob.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };
const fixedNow = () => new Date('2026-09-29T12:00:00.000Z');

/** In-memory repository mirroring the SQLite repository's contract. */
function createFakeRepository(users) {
  const sorted = [...users].sort((a, b) => (a.user < b.user ? -1 : 1));
  const badges = new Map();
  const saved = [];
  const pageCalls = [];

  return {
    saved,
    badges,
    pageCalls,
    listUserMetrics({ afterUser = '', limit }) {
      pageCalls.push({ afterUser, limit });
      return sorted.filter((u) => u.user > afterUser).slice(0, limit);
    },
    saveResults({ user, metrics, earned, computedAt }) {
      saved.push({ user, metrics, computedAt });
      const held = badges.get(user) ?? new Set();
      let awarded = 0;
      for (const { badgeId } of earned) {
        if (!held.has(badgeId)) {
          held.add(badgeId);
          awarded++;
        }
      }
      badges.set(user, held);
      return awarded;
    },
  };
}

test('grants badges and snapshots metrics for every user', async () => {
  const repository = createFakeRepository([
    { user: 'GA', campaignsJoined: 1, claimsMade: 1 },
    { user: 'GB', campaignsJoined: 0 },
  ]);
  const job = createAchievementBadgesJob({ repository, logger: silentLogger, now: fixedNow });

  const summary = await job();

  assert.deepEqual(summary, { usersScanned: 2, badgesGranted: 2, failures: 0 });
  assert.deepEqual([...repository.badges.get('GA')], ['first_steps', 'first_claim']);
  assert.equal(repository.badges.get('GB').size, 0);
  assert.equal(repository.saved[0].computedAt, '2026-09-29T12:00:00.000Z');
  assert.equal(repository.saved[1].metrics.campaignsJoined, 0);
});

test('re-running is idempotent', async () => {
  const repository = createFakeRepository([{ user: 'GA', referralsMade: 12 }]);
  const job = createAchievementBadgesJob({ repository, logger: silentLogger, now: fixedNow });

  assert.equal((await job()).badgesGranted, 2);
  assert.equal((await job()).badgesGranted, 0);
});

test('pages through users with a strictly advancing keyset cursor', async () => {
  const users = ['G1', 'G2', 'G3', 'G4', 'G5'].map((user) => ({ user, claimsMade: 1 }));
  const repository = createFakeRepository(users);
  const job = createAchievementBadgesJob({
    repository,
    batchSize: 2,
    logger: silentLogger,
    now: fixedNow,
  });

  const summary = await job();

  assert.equal(summary.usersScanned, 5);
  assert.deepEqual(
    repository.pageCalls.map((c) => c.afterUser),
    ['', 'G2', 'G4'],
  );
  assert.ok(repository.pageCalls.every((c) => c.limit === 2));
});

test('stops when the last page is exactly full', async () => {
  const repository = createFakeRepository([{ user: 'G1' }, { user: 'G2' }]);
  const job = createAchievementBadgesJob({ repository, batchSize: 2, logger: silentLogger });

  await job();

  assert.deepEqual(
    repository.pageCalls.map((c) => c.afterUser),
    ['', 'G2'],
  );
});

test('one failing user does not abort the run', async () => {
  const repository = createFakeRepository([
    { user: 'GA', claimsMade: 1 },
    { user: 'GB', claimsMade: 1 },
  ]);
  const save = repository.saveResults;
  repository.saveResults = (args) => {
    if (args.user === 'GA') throw new Error('disk full');
    return save(args);
  };
  const warnings = [];
  const logger = { ...silentLogger, warn: (...args) => warnings.push(args) };
  const job = createAchievementBadgesJob({ repository, logger, now: fixedNow });

  const summary = await job();

  assert.deepEqual(summary, { usersScanned: 2, badgesGranted: 1, failures: 1 });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0].user, 'GA');
});

test('rows without a valid user are counted as failures and skipped', async () => {
  const repository = createFakeRepository([{ user: 'GA', claimsMade: 1 }]);
  const list = repository.listUserMetrics;
  let first = true;
  repository.listUserMetrics = (opts) => {
    if (!first) return list(opts);
    first = false;
    return [{ user: '', claimsMade: 1 }, ...list(opts)];
  };
  const job = createAchievementBadgesJob({ repository, logger: silentLogger, now: fixedNow });

  const summary = await job();

  assert.equal(summary.failures, 1);
  assert.equal(summary.badgesGranted, 1);
});

test('throws instead of looping forever when a full page repeats', async () => {
  const repository = createFakeRepository([]);
  // Ignores the cursor: every call returns the same full page.
  repository.listUserMetrics = () => [{ user: 'GA' }, { user: 'GB' }];
  const job = createAchievementBadgesJob({ repository, batchSize: 2, logger: silentLogger });

  await assert.rejects(job(), /cursor did not advance/);
});

test('cursor regression on a later page is rejected', async () => {
  let call = 0;
  const repository = createFakeRepository([]);
  repository.listUserMetrics = () => (call++ === 0 ? [{ user: 'GB' }] : [{ user: 'GA' }]);
  const job = createAchievementBadgesJob({ repository, batchSize: 1, logger: silentLogger });

  await assert.rejects(job(), /cursor did not advance/);
});

test('missing repository is a logged no-op', async () => {
  const warnings = [];
  const job = createAchievementBadgesJob({
    repository: undefined,
    logger: { ...silentLogger, warn: (msg) => warnings.push(msg) },
  });

  assert.deepEqual(await job(), { usersScanned: 0, badgesGranted: 0, failures: 0 });
  assert.equal(warnings.length, 1);
});

test('rejects an invalid catalog at construction time', () => {
  assert.throws(
    () =>
      createAchievementBadgesJob({
        repository: createFakeRepository([]),
        catalog: [],
        logger: silentLogger,
      }),
    /non-empty/,
  );
});

test('clamps an invalid or oversized batch size', async () => {
  const repository = createFakeRepository([]);
  await createAchievementBadgesJob({ repository, batchSize: -3, logger: silentLogger })();
  await createAchievementBadgesJob({ repository, batchSize: 1e9, logger: silentLogger })();

  assert.deepEqual(
    repository.pageCalls.map((c) => c.limit),
    [500, 5_000],
  );
});
