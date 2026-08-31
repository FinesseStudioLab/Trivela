/**
 * Deterministic test-data factories.
 *
 * All factories accept an optional `overrides` object so callers can pin
 * only the fields they care about.  The seed-based counter ensures that
 * each call in a test suite produces a unique, reproducible fixture —
 * no random numbers, no Date.now(), no network calls.
 */

let _seq = 0;

/** Reset the sequence counter between test suites. */
export function resetFactorySequence() {
  _seq = 0;
}

/**
 * Build a campaign fixture that matches the Campaign schema in openapi.yaml.
 *
 * @param {Partial<import('../schemas.js').Campaign>} overrides
 */
export function makeCampaign(overrides = {}) {
  const n = ++_seq;
  return {
    id: n,
    name: `Campaign ${n}`,
    description: `Description for campaign ${n}`,
    active: true,
    featured: false,
    rewardPerAction: n * 10,
    maxParticipants: 100,
    startDate: '2025-01-01T00:00:00.000Z',
    endDate: '2025-12-31T23:59:59.000Z',
    createdAt: `2025-01-0${n > 9 ? n : '0' + n}T00:00:00.000Z`.replace(
      '00',
      String(n).padStart(2, '0'),
    ),
    updatedAt: `2025-01-0${n > 9 ? n : '0' + n}T00:00:00.000Z`.replace(
      '00',
      String(n).padStart(2, '0'),
    ),
    imageUrl: null,
    tags: [],
    category: null,
    ...overrides,
  };
}

/**
 * Build a minimal campaign suitable for POST /api/v1/campaigns request body.
 *
 * @param {object} overrides
 */
export function makeCampaignInput(overrides = {}) {
  const n = ++_seq;
  return {
    name: `Input Campaign ${n}`,
    description: `Input description ${n}`,
    rewardPerAction: n * 5,
    active: true,
    ...overrides,
  };
}

/**
 * Build a participant fixture.
 *
 * @param {object} overrides
 */
export function makeParticipant(overrides = {}) {
  const n = ++_seq;
  return {
    id: n,
    walletAddress: `G${'A'.repeat(54)}${String(n).padStart(2, '0')}`.slice(0, 56),
    campaignId: 1,
    registeredAt: '2025-06-01T00:00:00.000Z',
    pointsEarned: 0,
    ...overrides,
  };
}

/**
 * Build an API key fixture (plain-text form, before hashing).
 *
 * @param {object} overrides
 */
export function makeApiKey(overrides = {}) {
  const n = ++_seq;
  return {
    key: `trivela-test-key-${String(n).padStart(4, '0')}`,
    label: `Test Key ${n}`,
    createdAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Build a seed list of N campaigns.
 *
 * @param {number} count
 * @param {object} overrides applied to every item
 */
export function makeCampaigns(count, overrides = {}) {
  return Array.from({ length: count }, () => makeCampaign(overrides));
}
