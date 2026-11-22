import { defineConfig, devices } from '@playwright/test';
import { Keypair, StrKey } from '@stellar/stellar-sdk';

// Hermetic browser flow (#1319): a dedicated production build with an admin wallet and a rewards
// contract configured, served by `vite preview`. All network traffic (backend API, Soroban RPC)
// and the wallet extension are mocked inside the tests, so this needs no testnet, no backend and
// no real wallet. It is separate from playwright.config.js, whose build has no admin configured.

// Deterministic, valid identifiers: the admin wallet (whose address the build treats as the admin)
// and the rewards contract the app is pointed at.
export const FLOW_ADMIN_ADDRESS = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7)).publicKey();
export const FLOW_REWARDS_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 9));
const PORT = 4180;

export default defineConfig({
  testDir: './tests/flow',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_ADMIN_ADDRESSES: FLOW_ADMIN_ADDRESS,
      VITE_REWARDS_CONTRACT_ID: FLOW_REWARDS_CONTRACT_ID,
      VITE_STELLAR_NETWORK: 'testnet',
    },
  },
});
