import { test, expect } from '@playwright/test';

/**
 * E2E tests for the campaigns page.
 *
 * The webServer in playwright.config.js starts `vite preview` before the suite
 * runs, so no manual server start is required.
 *
 * Run:
 *   npm run build --workspace=frontend
 *   npm run test  --workspace=frontend
 */

test.describe('Campaigns page', () => {
  test('page loads with the correct title and hero heading', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Trivela/i);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Campaigns & rewards',
    );
  });

  test('campaigns section shows a list or empty state after loading', async ({ page }) => {
    await page.goto('/');

    // Either the campaigns grid or an empty-state block must appear once
    // loading has settled.  The empty state renders when the API is
    // unreachable (e.g. in CI without a running backend).
    await expect(page.locator('.campaigns-grid, .empty-state')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('clicking a campaign card navigates to the detail page', async ({ page }) => {
    await page.goto('/');

    // Wait for the campaigns panel to settle
    await expect(page.locator('.campaigns-grid, .empty-state')).toBeVisible({
      timeout: 15_000,
    });

    const firstCard = page.locator('.campaign-card-link').first();

    // Only run the navigation assertion when campaigns are actually present
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/campaign\//);
      await expect(page.getByRole('main')).toBeVisible();
    }
  });

  test('shows a loading state before campaigns resolve', async ({ page }) => {
    await page.route('**/api/v1/campaigns**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          pagination: {
            total: 0,
            count: 0,
            page: 1,
            limit: 6,
            offset: 0,
            totalPages: 0,
            hasPreviousPage: false,
            hasNextPage: false,
            previousPage: null,
            nextPage: null,
          },
        }),
      });
    });

    await page.goto('/');
    await expect(page.locator('.campaigns-loading')).toBeVisible();
    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('shows an error state when the campaigns request fails', async ({ page }) => {
    await page.route('**/api/v1/campaigns**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /load campaigns/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.locator('.campaigns-grid')).toHaveCount(0);
  });

  test('persists the selected theme across reloads', async ({ page }) => {
    await page.goto('/');

    const root = page.locator('html');
    const initialTheme = await root.getAttribute('data-theme');
    expect(['light', 'dark']).toContain(initialTheme);
    const nextTheme = initialTheme === 'dark' ? 'light' : 'dark';
    const toggleLabel = initialTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

    await page.getByRole('button', { name: toggleLabel }).click();
    await expect(root).toHaveAttribute('data-theme', nextTheme);

    await page.reload();
    await expect(root).toHaveAttribute('data-theme', nextTheme);
  });
});
