import { test, expect } from '@playwright/test';

test('basic navigation and landing page check', async ({ page }) => {
  await page.goto('/');

  // Check title
  await expect(page).toHaveTitle(/Trivela/i);

  // Check for the "My points" section
  await expect(page.locator('.rewards-title')).toContainText('My points');

  // Check for campaigns section
  await expect(page.locator('#campaigns-title')).toBeVisible();

  // Ensure either grid or empty state appears
  await expect(page.locator('.campaigns-grid, .empty-state')).toBeVisible({ timeout: 10000 });
});
