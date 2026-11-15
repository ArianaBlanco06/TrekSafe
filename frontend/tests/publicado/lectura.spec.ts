import { test, expect } from '@playwright/test';
import { leerConfiguracionPublicada } from './configuracion';

const destino = leerConfiguracionPublicada();
test('SOLO SMOKE: salud HTTP pública responde; no acredita DB, worker ni correo', async ({ request }) => {
  const respuesta = await request.get(`${destino.apiUrl}/salud`);
  expect(respuesta.status()).toBe(200);
  expect(respuesta.headers()['content-type']).toMatch(/json/);
});

test('SOLO SMOKE: ruta SPA pública y Service Worker real activo sin servidor ni mocks locales', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const registro = await navigator.serviceWorker.getRegistration();
    return registro?.active?.state === 'activated';
  }), { timeout: 25_000 }).toBe(true);
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
});
