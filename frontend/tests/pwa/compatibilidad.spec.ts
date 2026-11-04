import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { PlantillaCuenta } from '../../src/lib/plantillasCuentaLogica';

const users = {
  a: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', correoElectronico: 'cuenta-a@example.invalid', rol: 'senderista' },
  b: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', correoElectronico: 'cuenta-b@example.invalid', rol: 'senderista' },
};
const plantilla: PlantillaCuenta = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', nombre: 'Plantilla personal A',
  lugarInicio: 'Cebollapampa', lugarFin: 'Laguna 69', coordenadasInicio: null,
  coordenadasFin: '-9.01050, -77.60420', minutosTolerancia: 30, idsContactos: [],
  nombresAcompanantes: ['Acompañante ficticio'], version: 1,
  creadoEn: '2026-11-03T12:00:00Z', actualizadoEn: '2026-11-03T12:00:00Z',
};

async function moduleUrl(request: APIRequestContext): Promise<string> {
  // El mismo codigo real del probe puede importarse tras recargar sin red;
  // no se agrega el servidor de pruebas al precache de la PWA.
  const response = await request.get('/__tests__/probe.js');
  expect(response.ok()).toBe(true);
  return `data:text/javascript;base64,${Buffer.from(await response.text()).toString('base64')}`;
}

async function login(page: Page, account: 'a' | 'b' = 'a') {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(users[account].correoElectronico);
  await page.getByLabel('Contraseña', { exact: true }).fill('Fixture123!');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/senderista');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'))).toBe(true);
}

test('HU-29: el adaptador original conserva plantillas de la misma cuenta tras recarga offline', async ({ page, request, context }) => {
  const url = await moduleUrl(request);
  await login(page);
  const before = await page.evaluate(async data => {
    const probe = await import(data.url);
    await probe.plantillasHU29.reemplazarCachePlantillas(data.user.id, [data.plantilla]);
    return { scope: probe.sesion.getSessionScope(), plantillas: await probe.plantillasHU29.leerCachePlantillas(data.user.id) };
  }, { url, user: users.a, plantilla });
  expect(before.plantillas).toEqual([plantilla]);
  await context.setOffline(true);
  await page.reload();
  const after = await page.evaluate(async data => {
    const probe = await import(data.url);
    return { scope: probe.sesion.getSessionScope(), plantillas: await probe.plantillasHU29.leerCachePlantillas(data.user.id) };
  }, { url, user: users.a });
  expect(after).toEqual(before);
});

test('HU-29: rechaza claves ajenas/arbitrarias y sobres invalidos, manteniendo plantillasDesdeSobre', async ({ page, request }) => {
  const url = await moduleUrl(request);
  await login(page);
  const result = await page.evaluate(async data => {
    const probe = await import(data.url);
    const key = probe.logicaHU29.claveCachePlantillas(data.users.a.id);
    const own = probe.logicaHU29.crearSobreCache(data.users.a.id, [data.plantilla]);
    const foreign = probe.logicaHU29.crearSobreCache(data.users.b.id, [data.plantilla]);
    for (const invalid of ['/api/usuario/ficha-medica', 'clave-arbitraria',
      `plantillas-cuenta:v2:${data.users.a.id}`, `${key}:extra`,
      probe.logicaHU29.claveCachePlantillas(data.users.b.id)]) {
      await probe.offline.writeOfflineJson(invalid, own);
    }
    for (const invalid of [foreign, { ...own, esquema: 2 }, { ...own, plantillas: 'invalido' }, { fichaMedica: {} }]) {
      await probe.offline.writeOfflineJson(key, invalid);
    }
    const invalidLocal = Object.keys(localStorage).filter(key => key.startsWith('treksafe:offline-v2:'));
    await probe.offline.writeOfflineJson(key, { ...own, plantillas: [data.plantilla, null, { id: 5 }] });
    const filtered = await probe.plantillasHU29.leerCachePlantillas(data.users.a.id);
    const cacheName = (await caches.keys()).find(name => name.startsWith('treksafe-offline-v2-'))!;
    const cache = await caches.open(cacheName);
    const entry = (await cache.keys()).find(request => request.url.endsWith(encodeURIComponent(key)))!;
    await cache.put(entry, Response.json(foreign));
    const corrupted = await probe.plantillasHU29.leerCachePlantillas(data.users.a.id);
    return { invalidLocal, filtered, corrupted,
      foreign: await probe.plantillasHU29.leerCachePlantillas(data.users.b.id) };
  }, { url, users, plantilla });
  expect(result.invalidLocal).toEqual([]);
  expect(result.filtered).toEqual([plantilla]);
  expect(result.corrupted).toEqual([]);
  expect(result.foreign).toEqual([]);
});

test('HU-29: logout elimina plantillas y borradores; la segunda cuenta solo recupera los propios', async ({ page, request, context }) => {
  const url = await moduleUrl(request);
  await login(page);
  await page.evaluate(async data => {
    const probe = await import(data.url);
    await probe.plantillasHU29.reemplazarCachePlantillas(data.user.id, [data.plantilla]);
    await probe.offline.writeOfflineJson('expedition-drafts', [{ nombre: 'Borrador privado A' }]);
  }, { url, user: users.a, plantilla });
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/iniciar-sesion');
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter(name => name.startsWith('treksafe-')))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('treksafe:offline-v2:')))).toEqual([]);
  await login(page, 'b');
  const foreign = await page.evaluate(async data => {
    const probe = await import(data.url);
    const foreign = await probe.plantillasHU29.leerCachePlantillas(data.users.a.id);
    const drafts = await probe.offline.readOfflineJson('expedition-drafts', []);
    await probe.plantillasHU29.reemplazarCachePlantillas(data.users.b.id, [{ ...data.plantilla, nombre: 'Plantilla B' }]);
    return { foreign, drafts };
  }, { url, users, plantilla });
  expect(foreign).toEqual({ foreign: [], drafts: [] });
  await context.setOffline(true);
  await page.reload();
  const own = await page.evaluate(async data => {
    const probe = await import(data.url);
    return probe.plantillasHU29.leerCachePlantillas(data.user.id);
  }, { url, user: users.b });
  expect(own).toEqual([{ ...plantilla, nombre: 'Plantilla B' }]);
});

test('HU-29: una escritura pendiente de plantillas no reaparece despues de logout', async ({ page, request }) => {
  const url = await moduleUrl(request);
  await page.goto('/__tests__/vacio');
  const result = await page.evaluate(async data => {
    const probe = await import(data.url);
    probe.sesion.guardarSesion('fixture-a', data.users.a);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { started = resolve; });
    const originalPut = Cache.prototype.put;
    Cache.prototype.put = async function(request, response) {
      started(); await gate;
      return originalPut.call(this, request, response);
    };
    try {
      const write = probe.plantillasHU29.reemplazarCachePlantillas(data.users.a.id, [data.plantilla]);
      await waiting;
      await probe.sesion.limpiarSesion();
      probe.sesion.guardarSesion('fixture-b', data.users.b);
      release(); await write;
      return { caches: await caches.keys(), local: Object.values(localStorage),
        foreign: await probe.plantillasHU29.leerCachePlantillas(data.users.a.id) };
    } finally { Cache.prototype.put = originalPut; }
  }, { url, users, plantilla });
  expect(result.caches.filter(name => name.startsWith('treksafe-'))).toEqual([]);
  expect(result.local).toEqual([]);
  expect(result.foreign).toEqual([]);
});

test('HU-26: la actualizacion queda esperando y conserva el formulario abierto', async ({ page }) => {
  await page.goto('/__tests__/vacio');
  await page.evaluate(async account => {
    await navigator.serviceWorker.register('/__tests__/legacy-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    sessionStorage.setItem('treksafe:token', 'fixture-a');
    sessionStorage.setItem('treksafe:usuario', JSON.stringify(account));
  }, users.a);
  await page.goto('/senderista/expedicion/nueva');
  await page.getByLabel('Ubicación inicial', { exact: true }).fill('Formulario sin terminar');
  await page.getByLabel('Destino / Nevado', { exact: true }).fill('Destino pendiente');
  const initialOrigin = await page.evaluate(() => performance.timeOrigin);
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting?.scriptURL.endsWith('/sw.js'))).toBe(true);
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect(page.getByLabel('Ubicación inicial', { exact: true })).toHaveValue('Formulario sin terminar');
  await expect(page.getByLabel('Destino / Nevado', { exact: true })).toHaveValue('Destino pendiente');
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialOrigin);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/__tests__/legacy-sw.js'))).toBe(true);
});
