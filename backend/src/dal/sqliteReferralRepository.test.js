import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { up as createReferrals } from '../db/migrations/002_referrals.js';
import { getReferralTierProgress } from '../services/referralTiers.js';
import { createSqliteReferralRepository } from './sqliteReferralRepository.js';

function createRepo() {
  const db = new Database(':memory:');
  // Migration 002 alters the campaigns table, so provide the minimal one it expects.
  db.exec('CREATE TABLE campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
  createReferrals(db);
  return { db, repo: createSqliteReferralRepository({ db }) };
}

const addr = (n) => `G${String(n).padStart(55, 'A')}`;

test('create attributes a referee to the first referrer only', () => {
  const { repo } = createRepo();

  const first = repo.create({ campaignId: 1, referrerAddress: addr(1), refereeAddress: addr(9) });
  assert.equal(first.referrerAddress, addr(1));
  assert.equal(first.campaignId, '1');

  // A later attempt by a different referrer must not steal the attribution.
  const stolen = repo.create({ campaignId: 1, referrerAddress: addr(2), refereeAddress: addr(9) });
  assert.equal(stolen, null);
  assert.equal(repo.getByRefereeAndCampaign(1, addr(9)).referrerAddress, addr(1));
  assert.equal(repo.countByReferrer(1, addr(2)), 0);
});

test('re-submitting the same referral is idempotent', () => {
  const { repo } = createRepo();
  repo.create({ campaignId: 1, referrerAddress: addr(1), refereeAddress: addr(9) });
  assert.equal(
    repo.create({ campaignId: 1, referrerAddress: addr(1), refereeAddress: addr(9) }),
    null,
  );
  assert.equal(repo.countByReferrer(1, addr(1)), 1);
});

test('attribution is per campaign: one wallet can be referred in several campaigns', () => {
  const { repo } = createRepo();
  assert.ok(repo.create({ campaignId: 1, referrerAddress: addr(1), refereeAddress: addr(9) }));
  assert.ok(repo.create({ campaignId: 2, referrerAddress: addr(2), refereeAddress: addr(9) }));

  assert.equal(repo.getByRefereeAndCampaign(1, addr(9)).referrerAddress, addr(1));
  assert.equal(repo.getByRefereeAndCampaign(2, addr(9)).referrerAddress, addr(2));
  assert.equal(repo.getByRefereeAndCampaign(3, addr(9)), null);
});

test('multi-level tree: each referrer is credited only for direct referrals', () => {
  const { repo } = createRepo();
  // A refers B and C; B refers D, E, F; C refers G.
  const [A, B, C, D, E, F, G] = [1, 2, 3, 4, 5, 6, 7].map(addr);
  for (const [referrer, referee] of [
    [A, B],
    [A, C],
    [B, D],
    [B, E],
    [B, F],
    [C, G],
  ]) {
    assert.ok(repo.create({ campaignId: 1, referrerAddress: referrer, refereeAddress: referee }));
  }

  assert.equal(repo.countByReferrer(1, A), 2);
  assert.equal(repo.countByReferrer(1, B), 3);
  assert.equal(repo.countByReferrer(1, C), 1);
  assert.equal(repo.countByReferrer(1, D), 0, 'leaves have no referrals');
  assert.equal(repo.listByCampaign(1).length, 6);
});

test('leaderboard ranks by direct count with ties sharing a rank and ties broken by first referral', () => {
  const { repo } = createRepo();
  const [A, B, C] = [1, 2, 3].map(addr);
  // A: 2, B: 2 (tie), C: 1
  repo.create({ campaignId: 1, referrerAddress: B, refereeAddress: addr(20) });
  repo.create({ campaignId: 1, referrerAddress: A, refereeAddress: addr(21) });
  repo.create({ campaignId: 1, referrerAddress: A, refereeAddress: addr(22) });
  repo.create({ campaignId: 1, referrerAddress: B, refereeAddress: addr(23) });
  repo.create({ campaignId: 1, referrerAddress: C, refereeAddress: addr(24) });

  const { rows, total } = repo.getLeaderboard(1);
  assert.equal(total, 3);
  assert.deepEqual(
    rows.map((r) => [r.referralCount, r.rank]),
    [
      [2, 1],
      [2, 1],
      [1, 3],
    ],
    'standard competition ranking: 1, 1, 3',
  );
  assert.deepEqual(repo.getReferrerRank(1, A)?.rank, 1);
  assert.deepEqual(repo.getReferrerRank(1, C), { referralCount: 1, rank: 3 });
  assert.equal(repo.getReferrerRank(1, addr(99)), null, 'no referrals means unranked');
});

test('leaderboard paginates and is scoped to the campaign', () => {
  const { repo } = createRepo();
  for (let i = 1; i <= 5; i += 1) {
    for (let j = 0; j < i; j += 1) {
      repo.create({
        campaignId: 1,
        referrerAddress: addr(i),
        refereeAddress: addr(100 + i * 10 + j),
      });
    }
  }
  repo.create({ campaignId: 2, referrerAddress: addr(50), refereeAddress: addr(500) });

  const page = repo.getLeaderboard(1, { limit: 2, offset: 1 });
  assert.equal(page.total, 5);
  assert.deepEqual(
    page.rows.map((r) => r.referralCount),
    [4, 3],
  );
  assert.equal(repo.getLeaderboard(2).total, 1);
});

test('referral counts feed the tier split: crossing 10 and 25 moves a referrer up a tier', () => {
  const { repo } = createRepo();
  const referrer = addr(1);
  const tierAfter = (n) => getReferralTierProgress(repo.countByReferrer(1, referrer)).tier.id;

  for (let i = 1; i <= 25; i += 1) {
    repo.create({ campaignId: 1, referrerAddress: referrer, refereeAddress: addr(1000 + i) });
    if (i === 9) assert.equal(tierAfter(i), 'bronze');
    if (i === 10) assert.equal(tierAfter(i), 'silver');
    if (i === 24) assert.equal(tierAfter(i), 'silver');
    if (i === 25) assert.equal(tierAfter(i), 'gold');
  }
});
