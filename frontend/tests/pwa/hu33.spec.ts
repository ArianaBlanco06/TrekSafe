import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const id = '11111111-1111-4111-8111-111111111111';
const ruta = `/senderista/expedicion/${id}/recorrido`;
const plan = { id, estado: 'programada', version: 1, lugarInicio: 'Salida de prueba', lugarFin: 'Destino de prueba',
  coordenadasInicio: '-9.04, -77.61', coordenadasFin: '-9.01, -77.60',
  horaInicio: '2099-01-01T12:00:00Z', horaRetornoEstimada: '2099-01-01T18:00:00Z', minutosTolerancia: 30 };

async function preparar(page: Page, fallaMapa: boolean | 'una' = false, ajeno = false) {
  const control = { fallar: fallaMapa === true, fallidas: 0, correctas: 0 };
  await page.addInitScript(() => {
    sessionStorage.setItem('treksafe:token', 'fixture-hu33');
    sessionStorage.setItem('treksafe:usuario', JSON.stringify({ id: 'cuenta-a', rol: 'senderista' }));
  });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/recorrido')) return route.fulfill({ status: ajeno ? 404 : 200, json: ajeno
      ? { mensaje: 'Expedición no encontrada.' } : { plan, puntos: [
        { id: 'p2', orden: 2, nombre: 'Descanso', latitud: -9.02, longitud: -77.605 },
        { id: 'p1', orden: 1, nombre: 'Mirador', latitud: -9.03, longitud: -77.607 },
      ], preparacion: null } });
    if (url.pathname.endsWith('/expediciones')) return route.fulfill({ json: { expediciones: [plan] } });
    return route.fulfill({ json: { expedicion: null, avisos: [], noLeidos: 0 } });
  });
  await page.route('**/*.tile.openstreetmap.org/**', route => {
    if (control.fallar || (fallaMapa === 'una' && control.fallidas === 0)) { control.fallidas++; return route.abort(); }
    control.correctas++;
    return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  });
  return control;
}

test('HU-33: acceso, marcadores numerados, línea de referencia y preparación vacía', async ({ page }) => {
  await preparar(page);
  await page.goto('/senderista/expedicion');
  await page.getByRole('link', { name: /Ver recorrido de la expedición/ }).click();
  await expect(page).toHaveURL(ruta);
  await expect(page.locator('.treksafe-route-point')).toHaveCount(2);
  await expect(page.locator('.treksafe-route-point').first()).toHaveText('1');
  await expect(page.locator('path.leaflet-interactive')).toHaveCount(1);
  await expect(page.getByText('Sin lista de equipo asociada.')).toBeVisible();
  await page.getByText('Ver lista y coordenadas del recorrido', { exact: true }).click();
  const lista = page.getByRole('region', { name: 'Lista del recorrido' }).filter({ visible: true });
  await expect(lista.getByRole('listitem')).toHaveText([
    /Inicio.*Salida de prueba.*-9.04000, -77.61000/, /1\. Mirador.*-9.03000, -77.60700/,
    /2\. Descanso.*-9.02000, -77.60500/, /Destino.*Destino de prueba.*-9.01000, -77.60000/,
  ]);
});
test('HU-33: fallo completo muestra la lista y reintentar recupera el mapa', async ({ page }) => {
  const control = await preparar(page, true); await page.goto(ruta);
  await expect(page.getByRole('status')).toContainText('El mapa no está disponible');
  await expect(page.getByRole('region', { name: 'Lista del recorrido' }).filter({ visible: true }).getByRole('listitem')).toHaveCount(4);
  control.fallar = false;
  await page.getByRole('button', { name: 'Reintentar mapa' }).click();
  await expect(page.locator('.treksafe-route-point')).toHaveCount(2);
  await expect(page.getByText('El mapa no está disponible.', { exact: false })).toHaveCount(0);
});

test('HU-33: una sola imagen fallida conserva el mapa, los puntos y la línea', async ({ page }, info) => {
  const control = await preparar(page, 'una'); await page.goto(ruta);
  await expect(page.getByRole('status')).toContainText('Algunas imágenes del mapa no cargaron');
  expect(control.fallidas).toBe(1); expect(control.correctas).toBeGreaterThan(0);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.treksafe-route-point')).toHaveCount(2);
  await expect(page.locator('path.leaflet-interactive')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Lista del recorrido' }).filter({ visible: true })).toHaveCount(0);
  await info.attach('mapa-con-una-tesela-fallida.png', { body: await page.screenshot(), contentType: 'image/png' });
});

test('HU-33: al desplazar el mapa cuenta las imágenes correctas que siguen visibles', async ({ page }) => {
  const control = await preparar(page); await page.goto(ruta);
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  control.fallar = true;
  const rect = (await page.locator('.leaflet-container').boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 150, rect.y + rect.height / 2, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => control.fallidas).toBeGreaterThan(0);
  await expect(page.getByRole('status')).toContainText('Algunas imágenes del mapa no cargaron');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar mapa' })).toHaveCount(0);
});
test('HU-33: sin conexión conserva la lista abierta; plan ajeno no expone recorrido', async ({ page, context }) => {
  await preparar(page); await page.goto(ruta);
  await expect(page.locator('.treksafe-route-point')).toHaveCount(2);
  await context.setOffline(true);
  await expect(page.getByRole('region', { name: 'Lista del recorrido' }).filter({ visible: true }).getByText('1. Mirador')).toBeVisible();
  await context.setOffline(false);
  await page.unroute('**/api/**'); await preparar(page, false, true); await page.goto(ruta);
  await expect(page.getByRole('alert')).toContainText('Expedición no encontrada');
  await expect(page.getByText('1. Mirador')).toHaveCount(0);
});
