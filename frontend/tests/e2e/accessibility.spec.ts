/**
 * Accessibility (a11y) Tests
 *
 * Automated accessibility checks using axe-core via Playwright.
 * Tests key screens for WCAG 2.1 Level AA compliance.
 *
 * Critical violations fail the build in CI.
 * Moderate/minor violations are reported but don't block.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from 'axe-playwright';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Helper to check and report accessibility violations
async function checkA11y(page: any, context: string) {
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const { violations } = accessibilityScanResults;

  // Categorize violations by impact
  const critical = violations.filter((v) => v.impact === 'critical');
  const serious = violations.filter((v) => v.impact === 'serious');
  const moderate = violations.filter((v) => v.impact === 'moderate');
  const minor = violations.filter((v) => v.impact === 'minor');

  // Log summary
  console.log(`\n🔍 Accessibility Scan: ${context}`);
  console.log(`   Critical: ${critical.length}`);
  console.log(`   Serious:  ${serious.length}`);
  console.log(`   Moderate: ${moderate.length}`);
  console.log(`   Minor:    ${minor.length}`);

  // Log critical violations in detail
  if (critical.length > 0) {
    console.log('\n❌ CRITICAL VIOLATIONS:');
    critical.forEach((violation, i) => {
      console.log(`\n${i + 1}. ${violation.id}: ${violation.description}`);
      console.log(`   Impact: ${violation.impact}`);
      console.log(`   Help: ${violation.helpUrl}`);
      console.log(`   Affected elements: ${violation.nodes.length}`);
      violation.nodes.forEach((node, j) => {
        console.log(`      ${j + 1}) ${node.html}`);
        console.log(`         ${node.failureSummary}`);
      });
    });
  }

  // Fail test if critical violations exist
  expect(
    critical,
    `${context} has ${critical.length} critical accessibility violations`,
  ).toHaveLength(0);

  // Warn about serious violations but don't fail
  if (serious.length > 0) {
    console.log(`\n⚠️  ${serious.length} serious violations found (not failing build)`);
  }
}

test.describe('Accessibility Tests', () => {
  test('Homepage - no critical a11y violations', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, 'Homepage');
  });

  test('Campaign list page - no critical a11y violations', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/campaigns`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, 'Campaign List');
  });

  test('Campaign detail page - no critical a11y violations', async ({ page }) => {
    // Note: This assumes a campaign exists. In CI, may need to seed data.
    await page.goto(`${FRONTEND_URL}/`);
    await page.waitForLoadState('networkidle');

    // Try to click first campaign if it exists
    const firstCampaign = page.locator('a[href^="/campaign/"]').first();
    const exists = await firstCampaign.isVisible({ timeout: 3000 }).catch(() => false);

    if (exists) {
      await firstCampaign.click();
      await page.waitForLoadState('networkidle');
      await checkA11y(page, 'Campaign Detail');
    } else {
      test.skip('No campaigns available for a11y testing');
    }
  });

  test('Navigation and header - no critical a11y violations', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);

    // Check header/nav specifically
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('header')
      .include('nav')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = accessibilityScanResults.violations.filter((v) => v.impact === 'critical');
    expect(critical, 'Navigation has critical a11y violations').toHaveLength(0);
  });

  test('Forms and inputs - no critical a11y violations', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);

    // Check all form elements
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('form')
      .include('input')
      .include('button')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = accessibilityScanResults.violations.filter((v) => v.impact === 'critical');
    expect(critical, 'Forms have critical a11y violations').toHaveLength(0);
  });

  test('Keyboard navigation - focus indicators visible', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);

    // Press Tab to navigate
    await page.keyboard.press('Tab');

    // Check that focused element has visible focus indicator
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;

      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        outlineWidth: styles.outlineWidth,
        outlineColor: styles.outlineColor,
        boxShadow: styles.boxShadow,
      };
    });

    // Should have some form of focus indicator
    const hasFocusIndicator =
      focusedElement &&
      (focusedElement.outlineWidth !== '0px' || focusedElement.boxShadow !== 'none');

    expect(hasFocusIndicator, 'Focused elements must have visible focus indicators').toBeTruthy();
  });

  test('Color contrast - meets WCAG AA standards', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .disableRules(['color-contrast']) // We'll check this specifically
      .analyze();

    // Re-enable and check color contrast specifically
    const contrastResults = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();

    const contrastViolations = contrastResults.violations.filter(
      (v) => v.id === 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious'),
    );

    if (contrastViolations.length > 0) {
      console.log('\n⚠️  Color contrast issues found:');
      contrastViolations.forEach((v) => {
        console.log(`   ${v.description}`);
        v.nodes.forEach((node) => {
          console.log(`      ${node.html}`);
        });
      });
    }

    expect(contrastViolations, 'Critical/serious color contrast violations').toHaveLength(0);
  });

  test('Images - all have alt text', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['image-alt'])
      .analyze();

    const altTextViolations = accessibilityScanResults.violations.filter(
      (v) => v.id === 'image-alt',
    );

    if (altTextViolations.length > 0) {
      console.log('\n❌ Images without alt text:');
      altTextViolations.forEach((v) => {
        v.nodes.forEach((node) => {
          console.log(`   ${node.html}`);
        });
      });
    }

    expect(altTextViolations, 'All images must have alt text').toHaveLength(0);
  });

  test('ARIA attributes - used correctly', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['best-practice'])
      .withRules([
        'aria-valid-attr',
        'aria-valid-attr-value',
        'aria-allowed-attr',
        'aria-required-attr',
        'aria-required-children',
        'aria-required-parent',
      ])
      .analyze();

    const ariaViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    if (ariaViolations.length > 0) {
      console.log('\n❌ ARIA violations:');
      ariaViolations.forEach((v) => {
        console.log(`   ${v.id}: ${v.description}`);
      });
    }

    expect(ariaViolations, 'ARIA attributes must be used correctly').toHaveLength(0);
  });

  test('Headings - proper hierarchy', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['heading-order'])
      .analyze();

    const headingViolations = accessibilityScanResults.violations.filter(
      (v) => v.id === 'heading-order',
    );
    expect(headingViolations, 'Heading hierarchy must be correct').toHaveLength(0);
  });

  test('Buttons and links - accessible names', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['button-name', 'link-name'])
      .analyze();

    const nameViolations = accessibilityScanResults.violations.filter(
      (v) =>
        (v.id === 'button-name' || v.id === 'link-name') &&
        (v.impact === 'critical' || v.impact === 'serious'),
    );

    expect(nameViolations, 'All buttons and links must have accessible names').toHaveLength(0);
  });
});

test.describe('Mobile Accessibility', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    isMobile: true,
  });

  test('Mobile homepage - no critical a11y violations', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);
    await page.waitForLoadState('networkidle');
    await checkA11y(page, 'Mobile Homepage');
  });

  test('Mobile navigation - accessible touch targets', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);

    // Check that interactive elements meet minimum touch target size (44x44px)
    const smallTargets = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        'button, a, input[type="button"], [role="button"]',
      );
      const small: string[] = [];

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 44) {
          small.push(`${el.tagName} (${Math.round(rect.width)}x${Math.round(rect.height)}px)`);
        }
      });

      return small;
    });

    if (smallTargets.length > 0) {
      console.log('\n⚠️  Small touch targets found (should be at least 44x44px):');
      smallTargets.forEach((target) => console.log(`   ${target}`));
    }

    // This is a warning, not a hard failure
    expect(smallTargets.length, 'Touch targets should be at least 44x44px').toBeLessThan(5);
  });
});
