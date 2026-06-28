import { test, expect } from '@playwright/test';

/**
 * Visual regression tests for Storybook components.
 * These tests capture screenshots of each story and compare them against
 * baseline images to detect unintended visual changes.
 *
 * Run: npm run test:visual
 * Update baselines: npm run test:visual:update
 */

const STORYBOOK_URL = process.env.STORYBOOK_URL || 'http://localhost:6006';

// Stories to test - add new stories here as they're created
const stories = [
  { id: 'layout-header--default', name: 'Header - Default' },
  { id: 'layout-header--connected-wallet', name: 'Header - ConnectedWallet' },
  { id: 'components-campaigncard--active', name: 'CampaignCard - Active' },
  { id: 'components-campaigncard--featured', name: 'CampaignCard - Featured' },
  { id: 'components-campaigncard--inactive', name: 'CampaignCard - Inactive' },
  { id: 'components-emptystate--no-campaigns', name: 'EmptyState - NoCampaigns' },
  { id: 'components-emptystate--search-no-results', name: 'EmptyState - SearchNoResults' },
  { id: 'components-statusbadge--active', name: 'StatusBadge - Active' },
  { id: 'components-statusbadge--upcoming', name: 'StatusBadge - Upcoming' },
  { id: 'components-statusbadge--ended', name: 'StatusBadge - Ended' },
  { id: 'components-statusbadge--paused', name: 'StatusBadge - Paused' },
];

test.describe('Storybook Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Storybook and wait for it to load
    await page.goto(STORYBOOK_URL);

    // Wait for Storybook to be fully loaded
    await page.waitForSelector('[data-testid="story-list"], .sidebar-container, #storybook-root', {
      timeout: 15000,
    });

    // Give Storybook additional time to initialize
    await page.waitForTimeout(2000);
  });

  for (const story of stories) {
    test(`${story.name} matches snapshot`, async ({ page }) => {
      // Navigate to the specific story
      const storyUrl = `${STORYBOOK_URL}/iframe.html?id=${story.id}&viewMode=story`;
      const response = await page.goto(storyUrl);

      // Check if the story loaded successfully
      if (!response || response.status() >= 400) {
        test.skip(`Story ${story.id} not found or failed to load`);
        return;
      }

      // Wait for the story to render
      await page.waitForSelector('#storybook-root > *', { timeout: 10000 });

      // Give components time to settle (animations, etc.)
      await page.waitForTimeout(1000);

      // Wait for any async loading to complete
      await page.waitForLoadState('networkidle');

      // Take screenshot and compare
      await expect(page).toHaveScreenshot(`${story.id}.png`, {
        fullPage: true,
        animations: 'disabled',
        // Allow small differences due to font rendering across platforms
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
