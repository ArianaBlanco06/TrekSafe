import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './tests/pwa',
  outputDir: './test-results/privacidad',
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/privacidad-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    browserName: 'chromium',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    serviceWorkers: 'allow',
    viewport: { width: 1100, height: 850 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `"${process.execPath}" "${fileURLToPath(new URL('./tests/pwa/servidor.mjs', import.meta.url))}"`,
    url: 'http://127.0.0.1:4174/__tests__/listo',
    reuseExistingServer: false,
  },
});
