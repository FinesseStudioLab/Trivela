import assert from 'node:assert/strict';
import test from 'node:test';
import { getReferralTierProgress, REFERRAL_TIERS } from './referralTiers.js';

test('the tier ladder is ordered, starts at zero and has unique ids', () => {
  assert.equal(REFERRAL_TIERS[0].minReferrals, 0);
  for (let i = 1; i < REFERRAL_TIERS.length; i += 1) {
    assert.ok(REFERRAL_TIERS[i].minReferrals > REFERRAL_TIERS[i - 1].minReferrals);
  }
  assert.equal(new Set(REFERRAL_TIERS.map((t) => t.id)).size, REFERRAL_TIERS.length);
});

test('every tier boundary lands in the right tier (inclusive lower bound)', () => {
  const cases = [
    [0, 'bronze'],
    [9, 'bronze'],
    [10, 'silver'],
    [24, 'silver'],
    [25, 'gold'],
    [49, 'gold'],
    [50, 'platinum'],
    [10_000, 'platinum'],
  ];
  for (const [count, expected] of cases) {
    assert.equal(getReferralTierProgress(count).tier.id, expected, `count ${count}`);
  }
});

test('progress toward the next tier is computed from the current tier floor', () => {
  // silver is 10..25 (span 15): 10 referrals = 0%, 17 = 47%, 24 = 93%
  assert.deepEqual(
    (({ progressPercent, referralsToNextTier, nextTier }) => ({
      progressPercent,
      referralsToNextTier,
      next: nextTier.id,
    }))(getReferralTierProgress(10)),
    { progressPercent: 0, referralsToNextTier: 15, next: 'gold' },
  );
  assert.equal(getReferralTierProgress(17).progressPercent, 47);
  assert.equal(getReferralTierProgress(24).progressPercent, 93);
  assert.equal(getReferralTierProgress(24).referralsToNextTier, 1);

  // first tier: 0..10
  assert.equal(getReferralTierProgress(0).progressPercent, 0);
  assert.equal(getReferralTierProgress(5).progressPercent, 50);
  assert.equal(getReferralTierProgress(5).nextTier.id, 'silver');
});

test('the top tier has no next tier and reports full progress', () => {
  const result = getReferralTierProgress(75);
  assert.equal(result.tier.id, 'platinum');
  assert.equal(result.nextTier, null);
  assert.equal(result.referralsToNextTier, 0);
  assert.equal(result.progressPercent, 100);
});

test('invalid or negative counts are treated as zero referrals', () => {
  for (const bad of [-5, NaN, Infinity * -1, undefined, null, 'x']) {
    const result = getReferralTierProgress(/** @type {any} */ (bad));
    assert.equal(result.tier.id, 'bronze', `input ${String(bad)}`);
    assert.equal(result.progressPercent, 0);
  }
});

test('tier never decreases and progress stays within 0..100 as referrals grow', () => {
  let previousIndex = 0;
  for (let count = 0; count <= 80; count += 1) {
    const { tier, progressPercent } = getReferralTierProgress(count);
    const index = REFERRAL_TIERS.findIndex((t) => t.id === tier.id);
    assert.ok(index >= previousIndex, `tier regressed at ${count}`);
    assert.ok(progressPercent >= 0 && progressPercent <= 100);
    previousIndex = index;
  }
});
