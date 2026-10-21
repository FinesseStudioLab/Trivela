import { defineConfig, devices } from '@playwright/test';

const mobileSpecs = ['**/cross-browser.spec.ts', '**/basic.spec.js'];

export default defineConfig({
  testDir: './',
  testMatch: ['**/tests/e2e/**/*.spec.{js,ts}', '**/e2e/**/*.spec.{js,ts}'],
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Desktop Edge (Chromium build with Microsoft's branding/channel).
    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    // Mobile engines (touch + small viewport): Chrome on Android, Safari on iOS,
    // and Edge on Android. CI installs these browsers per matrix entry. They run
    // the cross-browser smoke suite only: the wallet-extension specs assume a
    // desktop browser.
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: mobileSpecs,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      testMatch: mobileSpecs,
    },
    {
      name: 'mobile-edge',
      use: { ...devices['Pixel 7'], channel: 'msedge' },
      testMatch: mobileSpecs,
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
