import { test, expect, type Page } from '@playwright/test';

// Compatibilidad del fix de privacidad con historias ya integradas en develop:
// HU-26 (editar expedicion, registerType 'prompt') y HU-30 (listas de equipo).
// HU-29 no esta en develop: su contrato se documenta en docs/fixes/68-ajustes-compatibilidad.md.

const users = {
  a: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', correoElectronico: 'cuenta-a@example.invalid', rol: 'senderista' },
  b: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', correoElectronico: 'cuenta-b@example.invalid', rol: 'senderista' },
};
const planId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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

async function urlsCacheadas(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) urls.push(...(await (await caches.open(name)).keys()).map(r => r.url));
    return urls;
  });
}

async function almacenamientoLocal(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
}

test('HU-26: la actualizacion del worker queda esperando y conserva el formulario abierto', async ({ page }) => {
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
  await expect.poll(() => page.evaluate(async () =>
    !!(await navigator.serviceWorker.getRegistration())?.waiting?.scriptURL.endsWith('/sw.js'))).toBe(true);
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect(page.getByLabel('Ubicación inicial', { exact: true })).toHaveValue('Formulario sin terminar');
  await expect(page.getByLabel('Destino / Nevado', { exact: true })).toHaveValue('Destino pendiente');
  // Sin recarga automatica: el documento es el mismo y sigue controlado por el worker anterior.
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialOrigin);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/__tests__/legacy-sw.js'))).toBe(true);
});

test('HU-26: editar el plan usa la version vigente, conserva el formulario sin red y no cachea el plan', async ({ page, context }) => {
  await login(page);
  const apiPath = `/api/expediciones/${planId}`;
  await page.goto(`/expediciones/${planId}/editar`);
  await expect(page.getByRole('heading', { name: 'Editar expedición', exact: true })).toBeVisible();
  await expect(page.getByLabel('Destino / Nevado', { exact: true })).toHaveValue('Destino del plan');
  const guardar = page.getByRole('button', { name: 'Guardar cambios', exact: true });
  await expect(guardar).toBeDisabled();
  await page.getByLabel('Destino / Nevado', { exact: true }).fill('Destino corregido HU-26');
  await expect(guardar).toBeEnabled();
  await context.setOffline(true);
  await expect(guardar).toBeDisabled();
  await expect(page.getByLabel('Destino / Nevado', { exact: true })).toHaveValue('Destino corregido HU-26');
  // El plan privado no tiene fallback de cache sin red.
  expect(await page.evaluate(async endpoint => {
    try { return (await fetch(endpoint, { cache: 'no-store', headers: { Authorization: 'Bearer fixture-a' } })).status; }
    catch { return 'sin-red'; }
  }, apiPath)).toBe('sin-red');
  await context.setOffline(false);
  await expect(guardar).toBeEnabled();
  const response = page.waitForResponse(r => r.url().endsWith(apiPath) && r.request().method() === 'PUT');
  await guardar.click();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(result.request().postDataJSON().versionEsperada).toBe(1);
  expect((await result.json()).expedicion.version).toBe(2);
  expect((await urlsCacheadas(page)).some(url => url.includes('/api/expediciones'))).toBe(false);
  expect(await almacenamientoLocal(page)).not.toContain('Destino corregido HU-26');
});

test('HU-30: consultar, crear, editar y eliminar listas sin cachear respuestas ni filtrar entre cuentas', async ({ page, context }) => {
  await login(page);
  await page.goto('/senderista/perfil');
  await page.getByRole('link', { name: 'Listas de equipo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mis listas de equipo', exact: true })).toBeVisible();
  await expect(page.getByText('Aún no tienes listas', { exact: true })).toBeVisible();

  // Crear
  await page.getByRole('button', { name: 'Nueva lista', exact: true }).click();
  await page.getByPlaceholder('Ej. Equipo de alta montaña').fill('Equipo privado A');
  await page.getByRole('button', { name: 'Añadir ítem', exact: true }).click();
  await page.getByPlaceholder('Ej. Casco').fill('Casco ficticio A');
  await page.getByRole('checkbox', { name: 'Ítem 1 obligatorio', exact: true }).check();
  await page.getByRole('button', { name: 'Guardar lista', exact: true }).click();
  const listas = page.getByRole('list', { name: 'Listas personales de equipo' });
  await expect(listas.getByText('Equipo privado A', { exact: true })).toBeVisible();

  // Consultar y editar
  await page.getByRole('button', { name: 'Editar lista Equipo privado A', exact: true }).click();
  await expect(page.getByPlaceholder('Ej. Equipo de alta montaña')).toHaveValue('Equipo privado A');
  await expect(page.getByPlaceholder('Ej. Casco')).toHaveValue('Casco ficticio A');
  await page.getByPlaceholder('Ej. Equipo de alta montaña').fill('Equipo privado A editado');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cambios', exact: true }).click();
  await expect(listas.getByText('Equipo privado A editado', { exact: true })).toBeVisible();

  // Ninguna respuesta de HU-30 queda en Cache Storage ni en Web Storage.
  expect((await urlsCacheadas(page)).some(url => url.includes('/api/usuario/listas-equipo'))).toBe(false);
  expect(await almacenamientoLocal(page)).not.toMatch(/Equipo privado A|Casco ficticio A/);

  // Sin red la pagina no muestra datos privados desde una cache.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis listas de equipo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva lista', exact: true })).toBeDisabled();
  await expect(page.getByText('Equipo privado A editado', { exact: true })).toHaveCount(0);
  await context.setOffline(false);
  await page.reload();

  // Eliminar
  await page.getByRole('button', { name: 'Eliminar lista Equipo privado A editado', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar lista', exact: true }).click();
  await expect(page.getByText('Aún no tienes listas', { exact: true })).toBeVisible();

  // Una lista nueva de A no es visible para B en el mismo navegador.
  await page.getByRole('button', { name: 'Nueva lista', exact: true }).click();
  await page.getByPlaceholder('Ej. Equipo de alta montaña').fill('Equipo solo de A');
  await page.getByRole('button', { name: 'Guardar lista', exact: true }).click();
  await expect(listas.getByText('Equipo solo de A', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/iniciar-sesion');
  await login(page, 'b');
  await page.goto('/senderista/perfil/equipo');
  await expect(page.getByText('Aún no tienes listas', { exact: true })).toBeVisible();
  await expect(page.getByText('Equipo solo de A', { exact: true })).toHaveCount(0);
  expect(await almacenamientoLocal(page)).not.toContain('Equipo solo de A');
});
