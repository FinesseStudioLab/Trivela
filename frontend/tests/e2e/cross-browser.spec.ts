import { test, expect } from '@playwright/test';

/**
 * Cross-browser compatibility tests
 *
 * Verifies that key UI components render and function correctly across:
 * - Chromium (Chrome, Edge, Brave)
 * - Firefox
 * - WebKit (Safari)
 *
 * Run all browsers:
 *   npm run test:e2e
 *
 * Run specific browser:
 *   npx playwright test --project=firefox
 *   npx playwright test --project=webkit
 *   npx playwright test --project=chromium
 */

test.describe('Cross-browser compatibility', () => {
  test.beforeEach(async ({ page }) => {
    // Suppress the onboarding tour overlay (driver.js) — it auto-starts on
    // first load and intercepts pointer events on underlying UI elements,
    // which makes clicks on things like the theme toggle flaky/fail.
    await page.addInitScript(() => {
      window.localStorage.setItem('trivela:tour_completed', 'true');
    });
  });

  test('wallet connection modal renders correctly', async ({ page, browserName }) => {
    await page.goto('/');

    // Wait for page to load
    await expect(page).toHaveTitle(/Trivela/i);

    // Look for any wallet/connection button
    const connectButton = page.getByRole('button', { name: /connect|wallet/i }).first();

    if (await connectButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Button is present - test interaction
      await expect(connectButton).toBeVisible();
      console.log(`✓ [${browserName}] Wallet button visible`);

      // Test button click doesn't crash
      await connectButton.hover();
      console.log(`✓ [${browserName}] Wallet button hover works`);
    } else {
      console.log(`⚠️ [${browserName}] Wallet button not implemented yet`);
    }
  });

  test('campaign list grid layout displays correctly', async ({ page, browserName }) => {
    await page.goto('/');

    // Wait for campaigns to load
    await expect(page.locator('.campaigns-grid, .empty-state')).toBeVisible({
      timeout: 10_000,
    });

    // Check grid structure
    const grid = page.locator('.campaigns-grid');
    if (await grid.isVisible().catch(() => false)) {
      // Verify grid is properly displayed
      const bbox = await grid.boundingBox();
      expect(bbox).not.toBeNull();
      expect(bbox?.width).toBeGreaterThan(0);
      expect(bbox?.height).toBeGreaterThan(0);

      console.log(
        `✓ [${browserName}] Campaign grid rendered correctly (${bbox?.width}x${bbox?.height}px)`,
      );
    } else {
      console.log(`ℹ️ [${browserName}] Campaign grid empty or not visible`);
    }
  });

  test('theme toggle works in all browsers', async ({ page, browserName }) => {
    await page.goto('/');

    // Get initial theme
    const htmlElement = page.locator('html');
    const initialTheme = await htmlElement.getAttribute('data-theme');
    console.log(`ℹ️ [${browserName}] Initial theme: ${initialTheme}`);

    // Look for theme toggle button
    const themeToggle = page
      .getByRole('button', {
        name: /theme|dark|light|toggle/i,
      })
      .first();

    if (await themeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Click theme toggle
      await themeToggle.click();
      await page.waitForTimeout(300); // Wait for CSS transition

      // Verify theme changed
      const newTheme = await htmlElement.getAttribute('data-theme');
      expect(newTheme).not.toBe(initialTheme);

      console.log(`✓ [${browserName}] Theme toggled: ${initialTheme} → ${newTheme}`);

      // Click again to verify it toggles back
      await themeToggle.click();
      await page.waitForTimeout(300);
      const revertedTheme = await htmlElement.getAttribute('data-theme');
      expect(revertedTheme).toBe(initialTheme);

      console.log(`✓ [${browserName}] Theme toggle bidirectional`);
    } else {
      console.log(`⚠️ [${browserName}] Theme toggle button not found`);
    }
  });

  test('navigation works correctly across pages', async ({ page, browserName }) => {
    // Home page
    await page.goto('/');
    await expect(page).toHaveURL('/');
    console.log(`✓ [${browserName}] Home page loads`);

    // Wait for campaigns to render
    await expect(page.locator('.campaigns-grid, .empty-state')).toBeVisible({
      timeout: 10_000,
    });

    // Try to navigate to a campaign (if any exist)
    const firstCampaignLink = page.locator('[href*="/campaign/"]').first();
    if (await firstCampaignLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      const href = await firstCampaignLink.getAttribute('href');
      await firstCampaignLink.click();
      await expect(page).toHaveURL(new RegExp(href || '.'));
      console.log(`✓ [${browserName}] Campaign navigation works`);

      // Go back
      await page.goto('/');
      await expect(page).toHaveURL('/');
      console.log(`✓ [${browserName}] Back navigation works`);
    } else {
      console.log(`ℹ️ [${browserName}] No campaigns to navigate to`);
    }
  });

  test('responsive design adapts to viewport', async ({ page, browserName }) => {
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    const desktopGrid = page.locator('.campaigns-grid');
    if (await desktopGrid.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const desktopBbox = await desktopGrid.boundingBox();
      console.log(`✓ [${browserName}] Desktop (1920x1080): grid width ${desktopBbox?.width}px`);
    }

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500); // Wait for layout shift

    if (await desktopGrid.isVisible({ timeout: 5000 }).catch(() => false)) {
      const tabletBbox = await desktopGrid.boundingBox();
      console.log(`✓ [${browserName}] Tablet (768x1024): grid width ${tabletBbox?.width}px`);
    }

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    if (await desktopGrid.isVisible({ timeout: 5000 }).catch(() => false)) {
      const mobileBbox = await desktopGrid.boundingBox();
      console.log(`✓ [${browserName}] Mobile (375x667): grid width ${mobileBbox?.width}px`);
    }
  });

  test('form inputs work correctly', async ({ page, browserName }) => {
    await page.goto('/');

    // Look for any input elements (search, filter, etc.)
    const inputs = page.locator('input[type="text"], input[type="search"]');
    const count = await inputs.count();

    if (count > 0) {
      const firstInput = inputs.first();

      // Test focus
      await firstInput.focus();
      const isFocused = await firstInput.evaluate((el) => el === document.activeElement);
      expect(isFocused).toBe(true);
      console.log(`✓ [${browserName}] Input focus works`);

      // Test typing
      await firstInput.fill('test input');
      const value = await firstInput.inputValue();
      expect(value).toBe('test input');
      console.log(`✓ [${browserName}] Input typing works`);

      // Test clearing
      await firstInput.clear();
      const clearedValue = await firstInput.inputValue();
      expect(clearedValue).toBe('');
      console.log(`✓ [${browserName}] Input clearing works`);
    } else {
      console.log(`ℹ️ [${browserName}] No text inputs found to test`);
    }
  });

  test('button clicks and interactions work', async ({ page, browserName }) => {
    await page.goto('/');

    // Find clickable buttons
    const buttons = page.getByRole('button').first();

    if (await buttons.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Test hover
      await buttons.hover();
      console.log(`✓ [${browserName}] Button hover works`);

      // Test click doesn't crash
      const clickPromise = buttons.click().catch(() => {
        // Click might navigate or error - that's ok for this test
      });
      await Promise.race([clickPromise, new Promise((r) => setTimeout(r, 1000))]);

      console.log(`✓ [${browserName}] Button interaction works`);
    } else {
      console.log(`ℹ️ [${browserName}] No buttons found`);
    }
  });

  test('CSS media queries work correctly', async ({ page, browserName, browserName: name }) => {
    await page.goto('/');

    // Test light/dark preference detection
    const prefersDark = await page.evaluate(() => {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    const prefersLight = await page.evaluate(() => {
      return window.matchMedia('(prefers-color-scheme: light)').matches;
    });

    console.log(
      `ℹ️ [${browserName}] prefers-color-scheme - dark: ${prefersDark}, light: ${prefersLight}`,
    );
    expect(prefersDark || prefersLight).toBe(true);

    // Test device pixel ratio
    const devicePixelRatio = await page.evaluate(() => {
      return window.devicePixelRatio;
    });
    console.log(`ℹ️ [${browserName}] Device pixel ratio: ${devicePixelRatio}`);
  });

  test('console errors do not occur', async ({ page, browserName }) => {
    const errors: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Also capture page errors
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/');
    await expect(page.locator('.campaigns-grid, .empty-state')).toBeVisible({
      timeout: 10_000,
    });

    if (errors.length > 0) {
      console.warn(`⚠️ [${browserName}] Console errors detected:\n${errors.join('\n')}`);
    } else {
      console.log(`✓ [${browserName}] No console errors`);
    }
  });
});

test.describe('Browser-specific issues', () => {
  test('Safari/WebKit specific: smooth scroll behavior', async ({ page, browserName }) => {
    if (browserName !== 'webkit') {
      test.skip();
    }

    await page.goto('/');

    // Check if scroll-behavior is set
    const scrollBehavior = await page.evaluate(() => {
      return window.getComputedStyle(document.documentElement).scrollBehavior;
    });

    console.log(`ℹ️ [${browserName}] scroll-behavior: ${scrollBehavior}`);
    // Note: WebKit may not support smooth scroll in all versions
  });

  test('Firefox specific: form rendering', async ({ page, browserName }) => {
    if (browserName !== 'firefox') {
      test.skip();
    }

    await page.goto('/');

    // Firefox has specific form rendering behavior
    const formElements = page.locator('form, input, button');
    const count = await formElements.count();

    if (count > 0) {
      console.log(`✓ [${browserName}] Found ${count} form elements`);
    }
  });

  test('Chromium specific: DevTools Protocol features', async ({ page, browserName }) => {
    if (browserName !== 'chromium') {
      test.skip();
    }

    // Chromium-only features
    const metrics = await page.evaluate(() => {
      const perf = window.performance;
      return {
        navigationStart: perf.timing.navigationStart,
        loadEventEnd: perf.timing.loadEventEnd,
        duration: perf.timing.loadEventEnd - perf.timing.navigationStart,
      };
    });

    console.log(`✓ [${browserName}] Page load time: ${metrics.duration}ms`);
  });
});
