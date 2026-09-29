import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BADGE_CATALOG,
  badgeProgress,
  evaluateBadges,
  normalizeMetrics,
  validateBadgeCatalog,
} from './achievementBadgeService.js';

const badge = (overrides = {}) => ({
  id: 'test_badge',
  name: 'Test',
  description: 'Test badge',
  metric: 'claimsMade',
  threshold: 1,
  ...overrides,
});

test('built-in catalog is valid and frozen', () => {
  assert.equal(validateBadgeCatalog(BADGE_CATALOG), BADGE_CATALOG);
  assert.ok(Object.isFrozen(BADGE_CATALOG));
  assert.ok(BADGE_CATALOG.every((b) => Object.isFrozen(b)));
});

test('validateBadgeCatalog rejects malformed catalogs', () => {
  assert.throws(() => validateBadgeCatalog([]), /non-empty/);
  assert.throws(() => validateBadgeCatalog(/** @type {any} */ (null)), /non-empty/);
  assert.throws(() => validateBadgeCatalog([/** @type {any} */ (null)]), /must be an object/);
  assert.throws(() => validateBadgeCatalog([badge({ id: 'Bad-Id' })]), /Invalid badge id/);
  assert.throws(() => validateBadgeCatalog([badge(), badge()]), /Duplicate badge id/);
  assert.throws(
    () => validateBadgeCatalog([badge({ metric: /** @type {any} */ ('logins') })]),
    /unknown metric/,
  );
  for (const threshold of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateBadgeCatalog([badge({ threshold })]), /positive finite/);
  }
});

test('normalizeMetrics coerces missing, negative, and non-numeric values to 0', () => {
  assert.deepEqual(normalizeMetrics(undefined), {
    campaignsJoined: 0,
    creditsReceived: 0,
    pointsEarned: 0,
    claimsMade: 0,
    referralsMade: 0,
  });
  assert.deepEqual(
    normalizeMetrics({
      campaignsJoined: '3',
      creditsReceived: -4,
      pointsEarned: 'abc',
      claimsMade: Number.POSITIVE_INFINITY,
      referralsMade: 2,
    }),
    { campaignsJoined: 3, creditsReceived: 0, pointsEarned: 0, claimsMade: 0, referralsMade: 2 },
  );
});

test('evaluateBadges grants exactly the badges at or above threshold', () => {
  assert.deepEqual(evaluateBadges({}), []);

  const earned = evaluateBadges({ campaignsJoined: 5, pointsEarned: 999, referralsMade: 1 });
  assert.deepEqual(earned, [
    { badgeId: 'first_steps', metricValue: 5 },
    { badgeId: 'campaign_explorer', metricValue: 5 },
    { badgeId: 'connector', metricValue: 1 },
  ]);
});

test('evaluateBadges honours a custom catalog', () => {
  const catalog = [badge({ id: 'ten_claims', threshold: 10 })];
  assert.deepEqual(evaluateBadges({ claimsMade: 9 }, catalog), []);
  assert.deepEqual(evaluateBadges({ claimsMade: 10 }, catalog), [
    { badgeId: 'ten_claims', metricValue: 10 },
  ]);
});

test('badgeProgress reports a capped ratio for every badge', () => {
  const catalog = [badge({ id: 'a', threshold: 4 }), badge({ id: 'b', threshold: 2 })];
  assert.deepEqual(badgeProgress({ claimsMade: 3 }, catalog), [
    { badgeId: 'a', current: 3, threshold: 4, ratio: 0.75, earned: false },
    { badgeId: 'b', current: 3, threshold: 2, ratio: 1, earned: true },
  ]);
  assert.equal(badgeProgress({}).length, BADGE_CATALOG.length);
});
