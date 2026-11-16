import { test, expect, type Page } from '@playwright/test';
import { leerConfiguracionPublicada, type CuentaPublicada } from './configuracion';
import { rellenarAcceso } from './rellenarAcceso';

const destino = leerConfiguracionPublicada();
const cuentas = destino.cuentas!;

async function login(page: Page, cuenta: CuentaPublicada, rol: 'senderista' | 'rescatista') {
  await page.goto('/iniciar-sesion');
  const ayuda = page.getByRole('dialog', { name: 'TrekSafe en tu pantalla de inicio', exact: true });
  if (await ayuda.isVisible()) await ayuda.getByRole('button', { name: 'Entendido', exact: true }).click();
  if (rol === 'rescatista') await page.getByRole('button', { name: 'Rescatista', exact: true }).click();
  await rellenarAcceso(page, cuenta);
  const peticion = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/auth/iniciar-sesion'));
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  expect((await peticion).url()).toBe(`${destino.apiUrl}/auth/iniciar-sesion`);
  await expect(page).toHaveURL(new RegExp(`/${rol}(?:/|$)`));
  const identidad = await page.evaluate(() => {
    const usuario = JSON.parse(sessionStorage.getItem('treksafe:usuario') ?? '{}') as { id?: string; rol?: string };
    return { id: usuario.id, rol: usuario.rol };
  });
  expect(identidad.rol).toBe(rol);
  expect(typeof identidad.id).toBe('string');
  return identidad.id;
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
  expect(await page.evaluate(() => sessionStorage.getItem('treksafe:token') === null)).toBe(true);
  await expect.poll(() => page.evaluate(async () =>
    (await caches.keys()).every((name) => !name.startsWith('treksafe-offline-v2-')),
  )).toBe(true);
}

test('autenticado parcial: A/logout/B y lecturas privadas no cacheadas con SW activo', async ({ page, context }) => {
  const a = await login(page, cuentas.senderistaA, 'senderista');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated');
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const contactos = page.waitForResponse((r) => r.url() === `${destino.apiUrl}/usuario/contactos`);
  await page.goto('/senderista/perfil/contactos');
  expect((await contactos).status()).toBe(200);
  const privadasEnCache = () => page.evaluate(async (apiUrl) => {
    const urls: string[] = [];
    for (const nombre of await caches.keys()) {
      for (const request of await (await caches.open(nombre)).keys()) {
        if (request.url.startsWith(apiUrl) || new URL(request.url).pathname.startsWith('/api/')) urls.push('API privada cacheada');
      }
    }
    return urls;
  }, destino.apiUrl);
  expect(await privadasEnCache()).toEqual([]);
  await context.setOffline(true);
  const red = await page.evaluate(async (apiUrl) => {
    try {
      await fetch(`${apiUrl}/usuario/contactos`, { cache: 'no-store', headers: { Authorization: `Bearer ${sessionStorage.getItem('treksafe:token')}` } });
      return 'respuesta';
    } catch { return 'sin-red'; }
  }, destino.apiUrl);
  expect(red).toBe('sin-red');
  await context.setOffline(false);
  await logout(page);
  const b = await login(page, cuentas.senderistaB, 'senderista');
  expect(a === b).toBe(false);
  expect(await privadasEnCache()).toEqual([]);
  await logout(page);
  await login(page, cuentas.rescatista, 'rescatista');
  await page.goto('/rescatista/consola');
  await expect(page.getByRole('combobox')).toBeVisible();
  await logout(page);
});
