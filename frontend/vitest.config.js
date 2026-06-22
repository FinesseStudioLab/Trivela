import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    include: ['src/hooks/**/*.test.{js,jsx}', 'src/__tests__/**/*.test.{js,jsx,ts,tsx}'],
  },
});
