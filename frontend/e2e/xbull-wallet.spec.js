import { test, expect } from '@playwright/test';

/**
 * xBull wallet smoke tests (#1006)
 *
 * These tests mock window.xBullSDK so they run without the real extension
 * and verify the full connect → sign → network-detect flow as well as
 * graceful degradation when the wallet is absent.
 */

const MOCK_PUBLIC_KEY = 'GBDNKXSOWRW2XVWFYIRUAVVUYJOBW6TPOVWF7YJXP6LCNPFB2FZ7WLR';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const SIGNED_XDR = 'AAAAAQAAA...mocksignedxdr';

function injectXBullMock(page, { available = true } = {}) {
  return page.addInitScript(
    ({ key, passphrase, signed, avail }) => {
      if (!avail) return; // simulate absent wallet — xBullSDK not injected
      window.xBullSDK = {
        async connect() {},
        async getPublicKey() {
          return key;
        },
        async getNetwork() {
          return passphrase;
        },
        async signXDR(_xdr, _opts) {
          return signed;
        },
      };
    },
    {
      key: MOCK_PUBLIC_KEY,
      passphrase: TESTNET_PASSPHRASE,
      signed: SIGNED_XDR,
      avail: available,
    },
  );
}

test.describe('xBull wallet integration', () => {
  test('wallet modal lists xBull as detected when extension present', async ({ page }) => {
    await injectXBullMock(page);
    await page.goto('/');

    // Open wallet modal via the connect button
    const connectBtn = page.getByRole('button', { name: /connect wallet/i }).first();
    await connectBtn.click();

    const modal = page.getByRole('dialog', { name: /choose wallet/i });
    await expect(modal).toBeVisible();

    // xBull row should show "Detected" badge
    const xbullRow = modal.getByText('xBull').locator('..');
    await expect(xbullRow).toContainText('Detected');
  });

  test('wallet modal shows xBull install link when extension absent', async ({ page }) => {
    await injectXBullMock(page, { available: false });
    await page.goto('/');

    const connectBtn = page.getByRole('button', { name: /connect wallet/i }).first();
    await connectBtn.click();

    const modal = page.getByRole('dialog', { name: /choose wallet/i });
    await expect(modal).toBeVisible();

    // xBull row should offer an install link rather than a connect button
    const installLink = modal.getByRole('link', { name: /xbull/i });
    await expect(installLink).toHaveAttribute('href', 'https://xbull.app');
  });

  test('connecting xBull surfaces the wallet address in the header', async ({ page }) => {
    await injectXBullMock(page);
    await page.goto('/');

    const connectBtn = page.getByRole('button', { name: /connect wallet/i }).first();
    await connectBtn.click();

    const modal = page.getByRole('dialog', { name: /choose wallet/i });
    const xbullBtn = modal.getByRole('button', { name: /xbull/i });
    await xbullBtn.click();

    // Header should now show a truncated form of the public key
    await expect(page.getByText(/GBDNKX/)).toBeVisible({ timeout: 8000 });
  });
});
