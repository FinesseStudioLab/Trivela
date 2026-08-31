// E2E smoke test for Rabet wallet integration (#1009).
// Mocks window.rabet so the test runs without the real extension installed.
import { test, expect } from '@playwright/test';

const MOCK_ADDRESS = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZS4';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

test.describe('Rabet wallet integration (#1009)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject a mock Rabet extension before the app boots.
    await page.addInitScript(
      ({ addr, net }) => {
        window.rabet = {
          connect: () => Promise.resolve({ publicKey: addr, network: net }),
          sign: (xdr, _passphrase) => Promise.resolve({ xdr: 'mock-signed-' + xdr }),
        };
      },
      { addr: MOCK_ADDRESS, net: TESTNET_PASSPHRASE },
    );
  });

  test('Rabet wallet is detected as available', async ({ page }) => {
    await page.goto('/');
    const isAvailable = await page.evaluate(async () => {
      const { walletManager } = await import('/src/lib/wallet/index.js');
      const providers = await walletManager.getAvailableProviders();
      return providers.some((p) => p.name === 'Rabet');
    });
    expect(isAvailable).toBe(true);
  });

  test('connect returns the public key', async ({ page }) => {
    await page.goto('/');
    const address = await page.evaluate(async () => {
      const { walletManager } = await import('/src/lib/wallet/index.js');
      const { address } = await walletManager.connect('Rabet');
      return address;
    });
    expect(address).toBe(MOCK_ADDRESS);
  });

  test('getNetwork returns testnet passphrase', async ({ page }) => {
    await page.goto('/');
    const network = await page.evaluate(async () => {
      const { RabetProvider } = await import('/src/lib/wallet/index.js');
      const provider = new RabetProvider();
      return provider.getNetwork();
    });
    expect(network).toBe(TESTNET_PASSPHRASE);
  });

  test('sign returns a signed XDR string', async ({ page }) => {
    await page.goto('/');
    const signed = await page.evaluate(async () => {
      const { walletManager } = await import('/src/lib/wallet/index.js');
      await walletManager.connect('Rabet');
      return walletManager.signTransaction('rawXDR', {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });
    expect(signed).toBe('mock-signed-rawXDR');
  });

  test('gracefully reports Rabet as unavailable when extension is absent', async ({ page }) => {
    // Override the init script to remove rabet before app boots.
    await page.addInitScript(() => {
      delete window.rabet;
    });
    await page.goto('/');
    const isAvailable = await page.evaluate(async () => {
      const { walletManager } = await import('/src/lib/wallet/index.js');
      const providers = await walletManager.getAvailableProviders();
      return providers.some((p) => p.name === 'Rabet');
    });
    expect(isAvailable).toBe(false);
  });
});
