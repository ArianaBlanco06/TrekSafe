import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function abrir(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    sessionStorage.setItem('treksafe:token', 'fixture-a');
    sessionStorage.setItem('treksafe:usuario', JSON.stringify({ id: 'actor-rescate-ficticio', rol: 'rescatista', nombreCompleto: 'Rescatista ficticio' }));
  });
  await page.goto('/rescatista/estadisticas');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) await page.reload();
  await expect(page.getByRole('button', { name: 'Descargar CSV', exact: true })).toBeEnabled();
}
async function descargar(page: Page, info: TestInfo, boton = 'Descargar CSV') {
  const evento = page.waitForEvent('download');
  await page.getByRole('button', { name: boton, exact: true }).click();
  const descarga = await evento;
  expect(await descarga.failure()).toBe(null);
  const archivo = info.outputPath(descarga.suggestedFilename());
  await descarga.saveAs(archivo);
  return { nombre: descarga.suggestedFilename(), bytes: await readFile(archivo) };
}

test('HU-48: descarga móvil con filtros aplicados, 1000 filas, BOM y sin caché API', async ({ page, context }, info) => {
  await abrir(page);
  const csvPeticiones: URL[] = [];
  page.on('request', r => { const u = new URL(r.url()); if (u.pathname.endsWith('/estadisticas.csv')) csvPeticiones.push(u); });
  await page.getByLabel('Zona o destino', { exact: true }).fill('Destino sin aplicar');
  const archivo = await descargar(page, info);
  expect(csvPeticiones).toHaveLength(1);
  expect(csvPeticiones[0].searchParams.has('zona')).toBe(false);
  expect([...archivo.bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect(archivo.bytes.toString('utf8').split('\r\n')).toHaveLength(1002);
  expect(archivo.bytes.toString('utf8')).toContain('"Áncash, ""Sector sur"""');
  expect(archivo.nombre).toMatch(/^incidentes-apertura-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByText('Descarga solicitada. Revisa las descargas de tu navegador.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Descargar CSV', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('csv-movil-320px.png'), fullPage: true });
  const cacheada = await page.evaluate(async () => {
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) {
      if (new URL(r.url).pathname === '/api/rescate/estadisticas.csv') return true;
    }
    return false;
  });
  expect(cacheada).toBe(false);
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Descargar CSV', exact: true })).toBeDisabled();
  await expect(page.getByText('Conéctate a internet para descargar el CSV.', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Descargar CSV', exact: true })).toBeEnabled();
  expect(csvPeticiones).toHaveLength(1);
});

test('HU-48: cuerpo interrumpido no ofrece archivo y permite reintentar el mismo filtro', async ({ page }, info) => {
  await abrir(page);
  await page.getByLabel('Zona o destino', { exact: true }).fill('CSV interrumpido HU48');
  await page.getByRole('button', { name: 'Consultar estadísticas', exact: true }).click();
  await expect(page.getByText('Destino: CSV interrumpido HU48 · Resultado: Todos', { exact: true })).toBeVisible();
  let archivos = 0; page.on('download', () => { archivos++; });
  await page.getByRole('button', { name: 'Descargar CSV', exact: true }).click();
  await expect(page.getByText('No se pudo completar la descarga del CSV. Revisa tu conexión e inténtalo nuevamente.', { exact: true })).toBeVisible();
  expect(archivos).toBe(0);
  const archivo = await descargar(page, info, 'Reintentar descarga CSV');
  expect(archivos).toBe(1);
  expect(archivo.bytes.toString('utf8')).toContain('CSV interrumpido HU48');
  expect(archivo.bytes.toString('utf8').split('\r\n')).toHaveLength(1002);
});
