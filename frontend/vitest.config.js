import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
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
