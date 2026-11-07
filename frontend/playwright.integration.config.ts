import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

const baseURL = process.env.TREKSAFE_HU32_BASE_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || !process.env.TREKSAFE_HU32_CONTROL_TOKEN) {
  throw new Error('Ejecutar la integracion mediante test-hu32-sql.mjs --with-browser --postgrest <ejecutable>');
}

export default defineConfig({
  ...base,
  testDir: './tests/hu32-integration',
  outputDir: './test-results/integration',
  use: { ...base.use, baseURL, serviceWorkers: 'allow' },
  webServer: undefined,
});
