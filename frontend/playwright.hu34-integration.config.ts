import { defineConfig } from '@playwright/test';
import base from './playwright.integration.config.js';
export default defineConfig({ ...base, testDir: './tests/hu34-integration', outputDir: './test-results/hu34-integration' });
