/**
 * Deterministic test-data factories for frontend tests.
 *
 * Mirrors the shape returned by GET /api/v1/campaigns so that component
 * tests are always exercising realistic data without coupling to live APIs.
 */

let _seq = 0;

/** Reset sequence between suites when needed. */
export function resetFactorySequence() {
  _seq = 0;
}

/**
 * Build a campaign fixture as returned by the API.
 *
 * @param {object} overrides
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
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    imageUrl: null,
    tags: [],
    category: null,
    ...overrides,
  };
}

/**
 * Build a paginated campaigns API response envelope.
 *
 * @param {ReturnType<typeof makeCampaign>[]} campaigns
 * @param {object} paginationOverrides
 */
export function makeCampaignListResponse(campaigns, paginationOverrides = {}) {
  return {
    data: campaigns,
    pagination: {
      total: campaigns.length,
      count: campaigns.length,
      page: 1,
      limit: 20,
      offset: 0,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      previousPage: null,
      nextPage: null,
      ...paginationOverrides,
    },
  };
}

/**
 * Build N campaigns.
 *
 * @param {number} count
 * @param {object} overrides applied to every item
 */
export function makeCampaigns(count, overrides = {}) {
  return Array.from({ length: count }, () => makeCampaign(overrides));
}
