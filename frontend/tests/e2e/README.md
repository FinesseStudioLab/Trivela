# E2E Test Suite

End-to-end tests for the Trivela frontend using Playwright.

## Test Files

### `cross-browser.spec.ts`

**Purpose**: Verify cross-browser compatibility across Chromium, Firefox, and WebKit.

**Coverage**:

- ✅ Wallet connection modal rendering
- ✅ Campaign list grid layout
- ✅ Theme toggle functionality
- ✅ Navigation between pages
- ✅ Responsive design (desktop/tablet/mobile viewports)
- ✅ Form input interactions
- ✅ Button clicks and hovers
- ✅ CSS media query support
- ✅ Console error detection
- ✅ Browser-specific features (smooth scroll, form rendering, DevTools)

**CI Integration**: Runs as a matrix job in `.github/workflows/frontend-ci.yml`, executing once per browser engine.

### `campaign-lifecycle.test.ts`

**Purpose**: Test complete user journey from campaign creation to claiming rewards.

**Coverage**:

- Campaign CRUD operations via API
- User navigation to campaign pages
- Wallet connection (mock Freighter)
- Campaign data persistence
- Backend health checks

**Note**: Requires live backend (Docker Compose environment). Skips gracefully in standard CI.

### `basic.spec.js`, `campaigns.spec.js`, `leaderboard.spec.js`

Legacy test files covering basic smoke tests and page-specific functionality.

## Running Tests

### All browsers (recommended for CI)

```bash
npm run test:e2e
```

### Specific browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Single test file

```bash
npx playwright test tests/e2e/cross-browser.spec.ts
```

### With UI mode (interactive debugging)

```bash
npx playwright test --ui
```

### Headed mode (see browser)

```bash
npx playwright test --headed --project=chromium
```

## CI Execution

The E2E suite runs automatically on every PR:

1. **Build phase**: Frontend is built and stored as an artifact
2. **Cross-browser matrix**: 3 parallel jobs (chromium, firefox, webkit)
3. **Per-browser execution**: Each job installs its browser and runs all E2E tests
4. **Artifact collection**: Test results and videos uploaded for debugging

### CI Configuration

See `.github/workflows/frontend-ci.yml`:

- Job: `cross-browser-e2e`
- Strategy: matrix with `browser: [chromium, firefox, webkit]`
- Fail-fast: disabled (all browsers complete even if one fails)
- Artifacts: `playwright-results-{browser}`

## Browser Support

| Browser | Engine   | Tested Versions |
| ------- | -------- | --------------- |
| Chrome  | Chromium | Latest stable   |
| Edge    | Chromium | Latest stable   |
| Brave   | Chromium | Latest stable   |
| Firefox | Gecko    | Latest stable   |
| Safari  | WebKit   | Latest stable   |

## Writing Cross-Browser Tests

### Best Practices

1. **Use browser-agnostic selectors**

   ```ts
   // Good: Role-based selector
   page.getByRole('button', { name: /connect/i });

   // Avoid: Browser-specific CSS
   page.locator('input::-webkit-search-cancel-button');
   ```

2. **Handle timing differences**

   ```ts
   // Good: Built-in retry with timeout
   await expect(element).toBeVisible({ timeout: 5000 });

   // Avoid: Hard-coded waits
   await page.waitForTimeout(1000);
   ```

3. **Test responsive behavior**

   ```ts
   await page.setViewportSize({ width: 375, height: 667 }); // Mobile
   await page.setViewportSize({ width: 1920, height: 1080 }); // Desktop
   ```

4. **Capture browser-specific issues**

   ```ts
   test('Safari-specific smooth scroll', async ({ page, browserName }) => {
     if (browserName !== 'webkit') test.skip();
     // WebKit-only test
   });
   ```

5. **Assert absence of console errors**
   ```ts
   const errors: string[] = [];
   page.on('console', (msg) => {
     if (msg.type() === 'error') errors.push(msg.text());
   });
   await page.goto('/');
   expect(errors).toEqual([]);
   ```

## Debugging

### View test report locally

```bash
npx playwright show-report
```

### Debug specific test

```bash
npx playwright test --debug tests/e2e/cross-browser.spec.ts
```

### Generate trace for failed tests

Traces are automatically captured on failure. View with:

```bash
npx playwright show-trace test-results/*/trace.zip
```

## Common Issues

### WebKit-specific

- Smooth scroll may not be supported in older versions
- Form controls have different default styling
- Date/time inputs render differently

### Firefox-specific

- Some CSS custom properties behave differently
- Flexbox edge cases may vary
- WebGL performance differences

### Chromium-specific

- DevTools Protocol features not available in Firefox/WebKit
- Some experimental CSS features only in Chromium

## Related Documentation

- [Playwright Configuration](../../playwright.config.js)
- [Frontend CI Workflow](../../.github/workflows/frontend-ci.yml)
- [Visual Regression Tests](../visual/README.md)
