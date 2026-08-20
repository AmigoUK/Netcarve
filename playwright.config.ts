import { defineConfig } from '@playwright/test';

/**
 * End-to-end coverage for the packed extension.
 *
 * The suite drives a persistent Chrome profile with the unpacked build loaded. Chromium's
 * new headless mode supports `--load-extension`, so no display server is needed; see
 * `tests/e2e/fixtures.ts`. Every run is against `.output/chrome-mv3`, which the npm script
 * rebuilds first.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  // A persistent Chrome profile per worker is heavy and the storage assertions expect a
  // profile to themselves, so the suite runs serially.
  workers: 1,
  fullyParallel: false,
  forbidOnly: process.env.CI === 'true',
  retries: process.env.CI === 'true' ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI === 'true' ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
