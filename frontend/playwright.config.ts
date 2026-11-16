import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const puerto = Number(process.env.TREKSAFE_TEST_UI_PORT ?? 4173);
if (!Number.isInteger(puerto) || puerto < 1024 || puerto > 65535) throw new Error('TREKSAFE_TEST_UI_PORT inválido.');

export default defineConfig({
  testDir: './tests/hu32',
  outputDir: './test-results',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${puerto}`,
    browserName: 'chromium',
    // Aprovechar Edge instalado en Windows; en otros sistemas instalar Chromium.
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `"${process.execPath}" "${fileURLToPath(new URL('./node_modules/vite/bin/vite.js', import.meta.url))}" preview --host 127.0.0.1 --port ${puerto} --strictPort`,
    url: `http://127.0.0.1:${puerto}`,
    reuseExistingServer: false,
  },
});
