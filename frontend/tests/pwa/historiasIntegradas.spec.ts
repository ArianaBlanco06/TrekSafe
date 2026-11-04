import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, account = 'a') {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(`cuenta-${account}@example.invalid`);
  await page.getByLabel('Contraseña', { exact: true }).fill('Fixture123!');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/senderista');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('HU-26 integrada: edicion vigente, no-op bloqueado y formulario conservado sin red', async ({ page, context }) => {
  await login(page);
  const apiPath = '/api/expediciones/dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await page.goto('/expediciones/dddddddd-dddd-4ddd-8ddd-dddddddddddd/editar');
  await expect(page.getByRole('heading', { name: 'Editar expedición', exact: true })).toBeVisible();
  await expect(page.getByLabel('Destino / Nevado', { exact: true })).toHaveValue('Destino del plan');
  const guardar = page.getByRole('button', { name: 'Guardar cambios', exact: true });
  await expect(guardar).toBeDisabled();
  await page.getByLabel('Destino / Nevado', { exact: true }).fill('Destino corregido HU-26');
  await expect(guardar).toBeEnabled();
  await context.setOffline(true);
  await expect(guardar).toBeDisabled();
  await expect(page.getByLabel('Destino / Nevado', { exact: true })).toHaveValue('Destino corregido HU-26');
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
});

test('HU-29 integrada: selector personal y borrador offline conviven tras recarga', async ({ page, context }) => {
  await login(page);
  await page.goto('/senderista/expedicion/nueva');
  const plantilla = page.getByRole('button', { name: /Plantilla personal A/ });
  await expect(plantilla).toBeVisible();
  await page.getByLabel('Fecha y hora de salida', { exact: true }).fill('2099-11-15T08:00');
  await plantilla.click();
  await expect(page.getByLabel('Ubicación inicial', { exact: true })).toHaveValue('Cebollapampa');
  await expect(page.getByLabel('Fecha y hora de salida', { exact: true })).toHaveValue('');
  await page.getByLabel('Fecha y hora de salida', { exact: true }).fill('2099-11-15T08:00');
  await page.getByLabel('Retorno estimado', { exact: true }).fill('2099-11-15T18:00');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Guardar borrador offline', exact: true }).click();
  await expect(page.getByText('Borrador guardado para sincronizar', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nueva expedición' })).toBeVisible();
  await expect(plantilla).toBeVisible();
  await expect(page.getByText('1 borrador(es) pendiente(s) de sincronización.')).toBeVisible();
  await plantilla.click();
  await expect(page.getByLabel('Destino / Nevado', { exact: true })).toHaveValue('Laguna 69');
  await expect(page.getByLabel('Fecha y hora de salida', { exact: true })).toHaveValue('');
});

test('HU-30 integrada: ambos accesos del perfil, listas propias y aislamiento entre cuentas', async ({ page, context }) => {
  await login(page);
  await page.goto('/senderista/perfil');
  await expect(page.getByRole('link', { name: 'Mis plantillas de ruta', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Listas de equipo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mis listas de equipo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva lista', exact: true }).click();
  await page.getByPlaceholder('Ej. Equipo de alta montaña').fill('Equipo privado A integración');
  await page.getByRole('button', { name: 'Añadir ítem', exact: true }).click();
  await page.getByPlaceholder('Ej. Casco').fill('Casco ficticio A');
  await page.getByRole('checkbox', { name: 'Ítem 1 obligatorio', exact: true }).check();
  await page.getByRole('button', { name: 'Guardar lista', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Equipo privado A integración', exact: true })).toBeVisible();
  const cached = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) urls.push(...(await (await caches.open(name)).keys()).map(r => r.url));
    return urls;
  });
  expect(cached.some(url => url.includes('/api/usuario/listas-equipo'))).toBe(false);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/iniciar-sesion');
  await login(page, 'b');
  await page.goto('/senderista/perfil/equipo');
  await expect(page.getByText('Aún no tienes listas', { exact: true })).toBeVisible();
  await expect(page.getByText('Equipo privado A integración', { exact: true })).toHaveCount(0);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis listas de equipo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva lista', exact: true })).toBeDisabled();
  await expect(page.getByText('Equipo privado A integración', { exact: true })).toHaveCount(0);
});
