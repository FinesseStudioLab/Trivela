const BASE_URL = import.meta.env.VITE_REFERRAL_BASE_URL || 'https://trivela.network';

export function slugifyInfluencer(input) {
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

export function generateInfluencerReferralLink(influencerName) {
  const code = slugifyInfluencer(influencerName);
  if (!code) {
    throw new Error('influencerName must contain at least one alphanumeric character');
  }
  return { code, link: `${BASE_URL}/ref/${code}` };
}

export function buildReferralLink(code) {
  return `${BASE_URL}/ref/${code}`;
}
