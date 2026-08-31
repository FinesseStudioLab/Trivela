// @ts-check

/**
 * Referral perk tiers, keyed by cumulative referral count.
 * Mirrors the tier structure already used by the `referral-basic` campaign
 * template (see campaignTemplates.js) so the leaderboard and the template
 * describe the same reward ladder.
 */
export const REFERRAL_TIERS = [
  { id: 'bronze', name: 'Bronze', minReferrals: 0 },
  { id: 'silver', name: 'Silver', minReferrals: 10 },
  { id: 'gold', name: 'Gold', minReferrals: 25 },
  { id: 'platinum', name: 'Platinum', minReferrals: 50 },
];

/**
 * Compute the current tier and progress toward the next tier for a given
 * cumulative referral count.
 * @param {number} referralCount
 * @returns {{
 *   tier: { id: string, name: string, minReferrals: number },
 *   nextTier: { id: string, name: string, minReferrals: number } | null,
 *   referralsToNextTier: number,
 *   progressPercent: number,
 * }}
 */
export function getReferralTierProgress(referralCount) {
  const count = Number.isFinite(referralCount) && referralCount > 0 ? referralCount : 0;

  let tier = REFERRAL_TIERS[0];
  let nextTier = null;
  for (let i = 0; i < REFERRAL_TIERS.length; i += 1) {
    if (count >= REFERRAL_TIERS[i].minReferrals) {
      tier = REFERRAL_TIERS[i];
      nextTier = REFERRAL_TIERS[i + 1] ?? null;
    } else {
      break;
    }
  }

  if (!nextTier) {
    return { tier, nextTier: null, referralsToNextTier: 0, progressPercent: 100 };
  }

  const span = nextTier.minReferrals - tier.minReferrals;
  const progressed = count - tier.minReferrals;
  const progressPercent = span > 0 ? Math.min(100, Math.round((progressed / span) * 100)) : 100;

  return {
    tier,
    nextTier,
    referralsToNextTier: Math.max(0, nextTier.minReferrals - count),
    progressPercent,
  };
}
