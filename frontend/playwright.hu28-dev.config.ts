import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/hu28-dev',
  outputDir: './test-results/hu28-dev',
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    browserName: 'chromium', channel: process.platform === 'win32' ? 'msedge' : undefined,
    serviceWorkers: 'allow', viewport: { width: 1100, height: 850 }, trace: 'off',
    screenshot: 'off', video: 'off',
  },
});
