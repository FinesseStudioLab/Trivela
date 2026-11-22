// @ts-check

const BASE_URL = process.env.REFERRAL_BASE_URL ?? 'https://trivela.network';

/**
 * Slugify an influencer name/handle into a URL-safe referral code.
 * Examples: "Jane Doe" → "jane-doe", "@CryptoJane" → "cryptojane"
 *
 * @param {string} input
 * @returns {string}
 */
export function slugify(input) {
  return String(input ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Generate a referral code for a partner influencer.
 *
 * @param {string} influencerName - Display name or Twitter handle
 * @returns {{ code: string, link: string }}
 */
export function generateReferralCode(influencerName) {
  const code = slugify(influencerName);
  if (!code) {
    throw new Error('influencerName must contain at least one alphanumeric character');
  }
  return { code, link: `${BASE_URL}/ref/${code}` };
}

/**
 * Build the public referral link for an existing code.
 *
 * @param {string} code
 * @returns {string}
 */
export function buildReferralLink(code) {
  return `${BASE_URL}/ref/${code}`;
}

/**
 * Create the referral code service.
 */
export function createReferralCodeService() {
  return {
    slugify,
    generateReferralCode,
    buildReferralLink,
  };
}
