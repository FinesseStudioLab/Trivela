import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const stub = (name) => fileURLToPath(new URL(`./src/mocks/${name}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    // The LedgerHQ libraries are optional at runtime (LedgerProvider imports
    // them dynamically and degrades when missing), so they are not installed.
    // Alias them to local stubs so the specifiers resolve under Vite's import
    // analysis; the tests still replace the behaviour with vi.mock().
    alias: {
      '@ledgerhq/hw-transport-webusb': stub('ledgerhq-hw-transport-webusb.js'),
      '@ledgerhq/hw-app-stellar': stub('ledgerhq-hw-app-stellar.js'),
    },
    include: ['src/**/*.test.{js,jsx,ts,tsx}', 'src/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [
        'src/main.jsx',
        'src/vite-env.d.ts',
        'src/contracts/**',
        'src/mocks/**',
        'src/stories/**',
        'src/**/*.stories.{js,jsx,ts,tsx}',
        'src/**/*.d.ts',
        'src/tests/**',
        'src/lib/wallet/**',
      ],
      thresholds: {
        lines: 25,
        functions: 35,
        branches: 35,
        statements: 25,
      },
    },
  },
});
