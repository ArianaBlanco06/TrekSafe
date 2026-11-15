import { defineConfig } from '@playwright/test';
import { leerConfiguracionPublicada } from './tests/publicado/configuracion';

// Falla al arrancar si faltan destino/versión. No utiliza el servidor ficticio local.
const destino = leerConfiguracionPublicada();
export default defineConfig({
  testDir: './tests/publicado', workers: 1, retries: 0, timeout: 60_000,
  outputDir: './test-results/publicado',
  reporter: [['list'], ['json', { outputFile: './test-results/publicado/resultados.json' }]],
  metadata: {
    entorno: destino.entorno, frontendUrl: destino.frontendUrl, apiUrl: destino.apiUrl,
    commitDeclarado: destino.commit, esquemaDeclarado: destino.esquema,
    alcance: destino.modo === 'lectura' ? 'SOLO SMOKE PUBLICO; NO ACREDITA ACEPTACION' : 'SMOKE AUTENTICADO; completar matriz integral #112',
  },
  use: {
    baseURL: destino.frontendUrl, browserName: 'chromium',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    serviceWorkers: 'allow', ignoreHTTPSErrors: false,
    // No guardar JWT, contraseñas, respuestas privadas o ficha médica en trazas/capturas.
    trace: 'off', screenshot: 'off', video: 'off',
  },
  projects: [
    { name: 'publicado-lectura-SIN-ACEPTACION', testMatch: '**/lectura.spec.ts' },
    ...(destino.modo === 'aceptacion' ? [{ name: 'publicado-autenticado-parcial', testMatch: '**/autenticado.spec.ts' }] : []),
  ],
});
