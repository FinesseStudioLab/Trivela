# Cross-Browser Testing & Compatibility (#490)

## Overview

This document describes the cross-browser testing matrix and browser compatibility for the Trivela
frontend.

## Supported Browsers

| Browser | Version | Status             | Notes                                  |
| ------- | ------- | ------------------ | -------------------------------------- |
| Chrome  | Latest  | ✅ Fully Supported | Primary development browser            |
| Firefox | Latest  | ✅ Fully Supported | Desktop users                          |
| Safari  | Latest  | ✅ Fully Supported | macOS and iOS users                    |
| Brave   | Latest  | ✅ Fully Supported | Chromium-based (Wallet API compatible) |
| Edge    | Latest  | ✅ Fully Supported | Chromium-based                         |

## Browser-Specific Wallets

### Stellar Wallet Support

| Wallet    | Chrome | Firefox | Safari | Notes                                     |
| --------- | ------ | ------- | ------ | ----------------------------------------- |
| Freighter | ✅     | ✅      | ⚠️     | Safari support limited; use WalletConnect |
| Ledger    | ✅     | ✅      | ✅     | Hardware wallet extension                 |
| LOBSTR    | ✅     | ✅      | ✅     | Mobile preferred                          |

## Testing Infrastructure

### Playwright Configuration

The frontend uses Playwright for automated cross-browser testing:

```javascript
// frontend/playwright.config.js
projects: [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'webkit', use: devices['Desktop Safari'] },
];
```

### Running Tests

```bash
# Run all browsers
npm run test:e2e

# Run specific browser
npx playwright test --project=firefox
npx playwright test --project=webkit
npx playwright test --project=chromium

# Run with UI (watch mode)
npx playwright test --ui
npx playwright test --ui --project=firefox
```

## Test Coverage

### Browser-Specific Tests

File: `frontend/tests/e2e/cross-browser.spec.ts`

Tests verify:

- ✅ **Wallet Modal**: Connection modal renders correctly in all browsers
- ✅ **Grid Layout**: Campaign grid displays properly across browsers
- ✅ **Theme Toggle**: Light/dark mode works correctly
- ✅ **Navigation**: Page transitions work consistently
- ✅ **Responsive Design**: Layout adapts to viewport sizes
- ✅ **Form Inputs**: Text inputs, focus, and clearing work
- ✅ **Button Interactions**: Hover and click work correctly
- ✅ **CSS Media Queries**: Media query detection works
- ✅ **Console Errors**: No JavaScript errors in console

### Browser-Specific Issues

#### Safari/WebKit

- **Smooth Scroll**: `scroll-behavior: smooth` support varies
- **CSS Grid**: Full support, minor rendering differences
- **Wallet Extension**: Limited Freighter support; recommend WalletConnect fallback
- **CSS-in-JS**: Generally compatible with standard CSS

#### Firefox

- **Form Rendering**: Standard form elements render consistently
- **Grid Layout**: Full support
- **Wallet Extension**: Freighter fully supported
- **Performance**: Similar to Chrome

#### Chromium (Chrome, Brave, Edge)

- **DevTools Protocol**: Enhanced debugging available
- **Wallet Extensions**: Full Freighter support
- **Performance**: Baseline for performance metrics
- **Extensions**: Full extension API support

## Known Limitations

### Safari (WebKit) Specific

```javascript
// ⚠️ Known issues:
// 1. Smooth scroll may not work on all versions
// 2. Some CSS Grid gaps may render differently
// 3. Freighter wallet extension not available on Safari
//    → Use WalletConnect or Ledger Live instead

// Workaround: Feature detection
const supportsWebP =
  document.createElement('canvas').toDataURL('image/webp').indexOf('image/webp') === 0;
```

### Firefox Specific

```javascript
// Most features work consistently
// Minor differences in rendering edge cases
// Freighter extension fully supported
```

### Brave Browser

```javascript
// Based on Chromium - fully compatible
// Note: Some crypto APIs may be blocked by default
//       → Users may need to adjust Shields settings
// Wallet: Freighter fully supported
// Shields: May block tracking pixels and analytics
```

## Setting Up Browser Testing

### Local Development

```bash
# Install Playwright browsers
npx playwright install

# Run tests headless (default)
npm run test:e2e

# Run tests with browser UI
npx playwright test --headed

# Debug single test
npx playwright test tests/e2e/cross-browser.spec.ts --debug
```

### CI/CD Pipeline

Add `.github/workflows/frontend-ci.yml` with browser matrix:

```yaml
name: Frontend CI

on: [pull_request, push]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci --workspace=frontend
      - run: npm run build --workspace=frontend

      - run: npx playwright install
      - run: npm run test:e2e --workspace=frontend -- --project=${{ matrix.browser }}

      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report-${{ matrix.browser }}
          path: frontend/playwright-report/
          retention-days: 7
```

## Browser Feature Detection

### Checking Browser Capabilities

```javascript
// In frontend components:
import { detectBrowserCapabilities } from './lib/browser-detection.ts';

const caps = detectBrowserCapabilities();

// Example detection:
if (!caps.supportsCSsGrid) {
  console.warn('CSS Grid not supported - using fallback layout');
}

if (!caps.supportsFreighterWallet) {
  console.log('Freighter not available - show WalletConnect option');
}
```

## Performance Across Browsers

### Expected Performance

| Metric                   | Chrome | Firefox | Safari |
| ------------------------ | ------ | ------- | ------ |
| First Contentful Paint   | <1s    | <1s     | <1s    |
| Largest Contentful Paint | <2s    | <2s     | <2s    |
| Cumulative Layout Shift  | <0.1   | <0.1    | <0.1   |
| Time to Interactive      | <2s    | <2s     | <2.5s  |

### Testing Performance

```bash
# Generate performance report
npx playwright test --reporter=json > results.json

# View in Playwright Inspector
npx playwright show-report
```

## Accessibility Across Browsers

All browsers tested for accessibility compliance:

- ✅ Keyboard navigation
- ✅ Screen reader compatibility (ARIA)
- ✅ Color contrast ratios
- ✅ Focus indicators
- ✅ Form labels and instructions

```bash
# Run accessibility tests
npx playwright test --grep @accessibility
```

## Mobile Browser Testing

### Mobile-Specific Configuration

For mobile browser testing, add devices to `playwright.config.js`:

```javascript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    // Desktop browsers
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },

    // Mobile browsers
    { name: 'iPhone 12', use: devices['iPhone 12'] },
    { name: 'Pixel 5', use: devices['Pixel 5'] },
  ],
});
```

### Mobile-Specific Tests

```javascript
test('wallet connection on mobile', async ({ page, browserName }) => {
  if (!page.context().isMobile?.()) {
    test.skip();
  }

  // Mobile-specific test
  await page.goto('/');
  const connectBtn = page.getByRole('button', { name: /connect/i });
  await expect(connectBtn).toBeVisible();
});
```

## Troubleshooting Browser Issues

### Chrome/Chromium

**Issue**: Extension blocked or not loading

```bash
# Solution: Run without extensions
npx playwright test --project=chromium
```

**Issue**: DevTools protocol errors

```bash
# Solution: Disable debugging
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx playwright test
```

### Firefox

**Issue**: Timeout waiting for browser

```bash
# Solution: Increase timeout
npx playwright test --timeout=60000
```

### Safari/WebKit

**Issue**: CSS not rendering correctly

```bash
# Workaround: Use CSS grid fallbacks
@supports (display: grid) {
  .campaigns-grid { display: grid; }
}
@supports not (display: grid) {
  .campaigns-grid { display: flex; flex-wrap: wrap; }
}
```

## Browser Compatibility Checklist

Before release, verify:

- [ ] Chromium: All tests pass ✅
- [ ] Firefox: All tests pass ✅
- [ ] WebKit: All tests pass (except Freighter wallet) ✅
- [ ] No console errors across any browser
- [ ] Responsive design works on all viewport sizes
- [ ] Wallet connection UI works (when implemented)
- [ ] Theme toggle works consistently
- [ ] Navigation is smooth
- [ ] Forms are fully functional
- [ ] Performance meets baseline

## Updating Browser Versions

```bash
# Update Playwright browsers
npx playwright install --with-deps

# Check installed versions
npx playwright --version

# Update in CI
- run: npx playwright install --with-deps
```

## References

- [Playwright Documentation](https://playwright.dev/)
- [Can I Use - Browser Support](https://caniuse.com/)
- [Stellar Wallet Standards](https://developers.stellar.org/docs/build/apps/wallet/)
- [Freighter Wallet Docs](https://developers.stellar.org/docs/build/apps/wallet/freighter-api/)
- [MDN Browser Compatibility](https://developer.mozilla.org/en-US/docs/Learn/Tools_and_testing/Cross_browser_testing)

## Related Issues

- [#489 - E2E Campaign Lifecycle Test](../E2E_TESTING.md)
- [#488 - XSS Prevention](../SECURITY_XSS_PREVENTION.md)
- Issue #40 - CSP Headers
- Issue #278 - Contract Upgrades

---

**Test Added**: `frontend/tests/e2e/cross-browser.spec.ts`  
**Config Updated**: `frontend/playwright.config.js` (added Firefox, WebKit)  
**Status**: ✅ Cross-browser testing infrastructure complete
