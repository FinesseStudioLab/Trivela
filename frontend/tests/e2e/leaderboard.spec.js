import { test, expect } from '@playwright/test';

/**
 * E2E tests for the campaign leaderboard page.
 *
 * Uses Playwright route interception so tests run without a live backend.
 */

const CAMPAIGN_ID = '1';
const LEADERBOARD_URL = `/campaign/${CAMPAIGN_ID}/leaderboard`;

const MOCK_CAMPAIGN = { id: CAMPAIGN_ID, name: 'Test Campaign', status: 'active' };

const MOCK_LEADERBOARD = {
  data: [
    { rank: 1, walletAddress: 'GABC1234567890AAAA', points: 500, claimedPoints: 100 },
    { rank: 2, walletAddress: 'GXYZ9876543210BBBB', points: 400, claimedPoints: 50 },
    { rank: 3, walletAddress: 'GDEF1111222233334', points: 300, claimedPoints: 0 },
    { rank: 4, walletAddress: 'GHIJ5555666677778', points: 200, claimedPoints: 20 },
  ],
  pagination: {
    total: 4,
    count: 4,
    page: 1,
    limit: 20,
    offset: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
    previousPage: null,
    nextPage: null,
  },
};

async function interceptCampaign(page) {
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CAMPAIGN),
    });
  });
}

async function interceptLeaderboard(page, override = {}) {
  await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/leaderboard**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...MOCK_LEADERBOARD, ...override }),
    });
  });
}

test.describe('Campaign Leaderboard page', () => {
  test('renders the leaderboard heading and participant rows', async ({ page }) => {
    await interceptCampaign(page);
    await interceptLeaderboard(page);

    await page.goto(LEADERBOARD_URL);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Leaderboard');
    await expect(page.locator('.lb-table')).toBeVisible();

    // All four participant rows should appear. Firefox can take noticeably
    // longer than chromium/webkit to settle the debounced fetch + render
    // cycle under CI load, so give this initial-load assertion more room
    // than the 5s default before falling back to "0 elements".
    const rows = page.locator('.lb-row-data');
    await expect(rows).toHaveCount(4, { timeout: 15_000 });
  });

  test('displays gold, silver, bronze medals for top 3 ranks', async ({ page }) => {
    await interceptCampaign(page);
    await interceptLeaderboard(page);

    await page.goto(LEADERBOARD_URL);

    const rows = page.locator('.lb-row-data');
    await expect(rows).toHaveCount(4, { timeout: 15_000 });
    await expect(rows.nth(0)).toContainText('🥇');
    await expect(rows.nth(1)).toContainText('🥈');
    await expect(rows.nth(2)).toContainText('🥉');
  });

  test('shows truncated wallet addresses', async ({ page }) => {
    await interceptCampaign(page);
    await interceptLeaderboard(page);

    await page.goto(LEADERBOARD_URL);

    // First address GABC1234567890AAAA should be truncated to GABC12...AAAA
    const rows = page.locator('.lb-row-data');
    await expect(rows).toHaveCount(4, { timeout: 15_000 });
    await expect(rows.first().locator('.lb-col-address')).toContainText('GABC12...AAAA');
  });

  test('shows empty state when no participants', async ({ page }) => {
    await interceptCampaign(page);
    await interceptLeaderboard(page, {
      data: [],
      pagination: { ...MOCK_LEADERBOARD.pagination, total: 0, count: 0 },
    });

    await page.goto(LEADERBOARD_URL);

    await expect(page.locator('.lb-empty')).toBeVisible();
    await expect(page.locator('.lb-empty-heading')).toContainText('No participants yet');
  });

  test('shows skeleton loading state before data resolves', async ({ page }) => {
    await interceptCampaign(page);

    // Delay the leaderboard response
    await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/leaderboard**`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LEADERBOARD),
      });
    });

    await page.goto(LEADERBOARD_URL);

    await expect(page.locator('.lb-row-skeleton').first()).toBeVisible();
    // Rows should appear after load completes
    await expect(page.locator('.lb-row-data').first()).toBeVisible({ timeout: 5000 });
  });

  test('search input filters the leaderboard request', async ({ page }) => {
    await interceptCampaign(page);

    let capturedUrl = '';
    await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/leaderboard**`, async (route) => {
      capturedUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_LEADERBOARD, data: [] }),
      });
    });

    await page.goto(LEADERBOARD_URL);

    const searchInput = page.locator('.lb-search-input');
    await searchInput.fill('GABC');

    // Wait for debounce and re-fetch
    await page.waitForTimeout(400);
    expect(capturedUrl).toContain('q=GABC');
  });

  test('shows participant count', async ({ page }) => {
    await interceptCampaign(page);
    await interceptLeaderboard(page);

    await page.goto(LEADERBOARD_URL);

    await expect(page.locator('.lb-total-count')).toContainText('4 participants');
  });

  test('shows error state when leaderboard request fails', async ({ page }) => {
    await interceptCampaign(page);

    await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}/leaderboard**`, async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await page.goto(LEADERBOARD_URL);

    await expect(page.locator('.lb-error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('back link navigates to campaign detail', async ({ page }) => {
    await interceptCampaign(page);
    await interceptLeaderboard(page);

    // Also stub the campaign detail fetch so navigation works
    await page.route(`**/api/v1/campaigns/${CAMPAIGN_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CAMPAIGN),
      });
    });

    await page.goto(LEADERBOARD_URL);

    await page.getByRole('link', { name: /back to campaign/i }).click();
    await expect(page).toHaveURL(new RegExp(`/campaign/${CAMPAIGN_ID}$`));
  });
});
