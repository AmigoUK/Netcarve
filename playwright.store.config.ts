import { defineConfig } from '@playwright/test';

/**
 * Store-asset generation. Not part of `npm run test:e2e`: it writes the listing images into
 * `docs/store/`, so it runs on demand (`npm run screenshots`) rather than on every check.
 */
export default defineConfig({
  testDir: './tests/store',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: [['list']],
  outputDir: 'test-results/store',
});
