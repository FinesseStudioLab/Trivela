import { test, expect } from '@playwright/test';

/**
 * Visual regression tests for primary application screens.
 * Tests full-page screenshots of main user flows.
 *
 * Run: npm run test:visual
 * Update baselines: npm run test:visual:update
 */

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

test.describe('Primary Screens Visual Regression', () => {
  // Landing/Explore screens
  test('Explore campaigns screen', async ({ page }) => {
    await page.goto(`${APP_URL}/explore`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('explore-campaigns.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Campaign detail screen', async ({ page }) => {
    // Uses a mock campaign ID
    await page.goto(`${APP_URL}/campaign/test-campaign`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('campaign-detail.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Campaign leaderboard screen', async ({ page }) => {
    await page.goto(`${APP_URL}/campaign/test-campaign/leaderboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('campaign-leaderboard.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Campaign analytics screen', async ({ page }) => {
    await page.goto(`${APP_URL}/campaign/test-campaign/analytics`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('campaign-analytics.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  // User screens
  test('User dashboard screen', async ({ page }) => {
    await page.goto(`${APP_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('user-dashboard.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('User profile screen', async ({ page }) => {
    await page.goto(`${APP_URL}/profile`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('user-profile.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Referral leaderboard screen', async ({ page }) => {
    await page.goto(`${APP_URL}/referral-leaderboard`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('referral-leaderboard.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  // Admin screens
  test('Admin campaigns screen', async ({ page }) => {
    await page.goto(`${APP_URL}/admin/campaigns`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('admin-campaigns.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Operator analytics screen', async ({ page }) => {
    await page.goto(`${APP_URL}/operator-analytics`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('operator-analytics.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Webhook management screen', async ({ page }) => {
    await page.goto(`${APP_URL}/webhook-management`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('webhook-management.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Transaction history screen', async ({ page }) => {
    await page.goto(`${APP_URL}/transactions`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('transaction-history.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('About screen', async ({ page }) => {
    await page.goto(`${APP_URL}/about`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('about.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
