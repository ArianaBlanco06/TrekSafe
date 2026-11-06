import { test, expect, type Page, type TestInfo } from '@playwright/test';
import path from 'node:path';

// UI con build real y respuestas ficticias: no es evidencia de Supabase DEV.
// Las otras suites de esta carpeta siguen ejercitando el service worker real.
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
const id = '11111111-1111-4111-8111-111111111111';
const listaId = '44444444-4444-4444-8444-444444444444';
const usuario = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', correoElectronico: 'cuenta-a@example.invalid', rol: 'senderista' };
const ruta = `/senderista/expedicion/${id}/equipo`;
type Copia = { id: string; expedicionId: string; listaOrigenId: string; nombreLista: string;
  items: { id: string; nombre: string; obligatorio: boolean; preparado: boolean }[];
  obligatoriosPendientes: number; creadoEn: string; actualizadoEn: string };

async function preparar(page: Page) {
  const plan = { id, lugarInicio: 'Inicio ficticio', lugarFin: 'Destino ficticio', estado: 'programada', version: 1,
    horaInicio: new Date(Date.now() - 30 * 60_000).toISOString(),
    horaRetornoEstimada: new Date(Date.now() + 60 * 60_000).toISOString(), minutosTolerancia: 30,
    coordenadasInicio: null, coordenadasFin: null, idsContactos: [], nombresAcompanantes: [], creadoEn: new Date().toISOString() };
  const lista = { id: listaId, senderistaId: usuario.id, nombre: 'Equipo de montaña',
    items: [{ id: 'origen-1', nombre: 'Casco', obligatorio: true }, { id: 'origen-2', nombre: 'Cámara', obligatorio: false },
      { id: 'origen-3', nombre: 'Agua', obligatorio: true }], creadoEn: plan.creadoEn, actualizadoEn: plan.creadoEn };
  let copia: Copia | null = null;
  let fallaEquipo = false;
  let retornos = 0;
  let consultasEquipo = 0;
  await page.context().route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const responder = (status: number, json: unknown) => route.fulfill({ status, json, headers: { 'Cache-Control': 'no-store' } });
    if (url.pathname === `/api/expediciones/${id}`) return responder(200, { expedicion: plan });
    if (url.pathname === '/api/usuario/listas-equipo') return responder(200, { listas: [lista] });
    if (url.pathname === `/api/expediciones/${id}/equipo`) {
      consultasEquipo++;
      if (fallaEquipo) return responder(500, { mensaje: 'Equipo temporalmente no disponible' });
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ listaId });
        expect(copia).toBeNull();
        copia = { id: 'copia-fixture', expedicionId: id, listaOrigenId: listaId, nombreLista: lista.nombre,
          items: lista.items.map((item, i) => ({ ...item, id: `copia-${i}`, preparado: false })),
          obligatoriosPendientes: 2, creadoEn: plan.creadoEn, actualizadoEn: plan.creadoEn };
        return responder(201, { preparacion: copia });
      }
      return responder(200, { preparacion: copia });
    }
    if (url.pathname.startsWith(`/api/expediciones/${id}/equipo/items/`)) {
      if (!copia) return responder(404, { mensaje: 'No encontrada' });
      const item = copia.items.find((candidato) => candidato.id === url.pathname.split('/').at(-1))!;
      const datos = request.postDataJSON() as { preparado: boolean };
      expect(Object.keys(datos)).toEqual(['preparado']);
      item.preparado = datos.preparado;
      copia.obligatoriosPendientes = copia.items.filter((i) => i.obligatorio && !i.preparado).length;
      return responder(200, { preparacion: copia });
    }
    if (url.pathname === '/api/expediciones/activa') {
      return responder(200, { expedicion: { ...plan, fechaLimite: new Date(Date.now() + 90 * 60_000).toISOString(),
        cantidadAcompanantes: 0, cantidadContactos: 1, acompanantes: [], contactos: [] } });
    }
    if (url.pathname === `/api/expediciones/${id}/confirmar-retorno`) {
      expect(request.postDataJSON()).toEqual({ contrasena: 'Fixture123!' });
      retornos++;
      plan.estado = 'completada';
      return responder(200, { expedicion: plan, confirmadoEn: new Date().toISOString() });
    }
    return responder(200, {});
  });
  await page.goto('/__tests__/vacio');
  await page.evaluate((u) => {
    sessionStorage.setItem('treksafe:token', 'fixture-a');
    sessionStorage.setItem('treksafe:usuario', JSON.stringify(u));
  }, usuario);
  await page.goto(ruta);
  await expect(page.getByRole('heading', { name: 'Sin lista de equipo asociada' })).toBeVisible();
  return { plan, setFallaEquipo: () => { fallaEquipo = true; }, retornos: () => retornos, consultasEquipo: () => consultasEquipo };
}

async function asociar(page: Page) {
  await page.getByLabel('Lista personal de equipo').selectOption(listaId);
  await page.getByRole('button', { name: 'Asociar lista', exact: true }).click();
  const dialogo = page.getByRole('alertdialog', { name: '¿Asociar esta lista?' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: 'Confirmar asociación', exact: true }).click();
  await expect(page.getByLabel('Casco', { exact: false })).toBeEnabled();
}

async function captura(page: Page, info: TestInfo, nombre: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const viewport = page.viewportSize()!;
  // Captura completa a ancho móvil, sin que el pie fijo tape contenido intermedio.
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, alto + 80) });
  const archivo = info.outputPath(`${nombre}.png`);
  await page.screenshot({ path: archivo, fullPage: true });
  await page.setViewportSize(viewport);
  await info.attach(nombre, { path: path.resolve(archivo), contentType: 'image/png' });
}

test('HU-31: confirmación PWA, casillas, contador y recarga en pantalla móvil', async ({ page }, info) => {
  await preparar(page);
  await expect(page.getByRole('button', { name: 'Asociar lista', exact: true })).toBeDisabled();
  await page.getByLabel('Lista personal de equipo').selectOption(listaId);
  await page.getByRole('button', { name: 'Asociar lista', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sin lista de equipo asociada' })).toBeVisible();
  await asociar(page);
  await expect(page.getByText('2 ítems obligatorios pendientes.', { exact: true })).toBeVisible();
  await page.getByLabel('Cámara', { exact: false }).click();
  await expect(page.getByLabel('Cámara', { exact: false })).toBeChecked();
  await expect(page.getByText('2 ítems obligatorios pendientes.', { exact: true })).toBeVisible();
  await page.getByLabel('Casco', { exact: false }).click();
  await expect(page.getByLabel('Casco', { exact: false })).toBeChecked();
  await expect(page.getByText('1 ítem obligatorio pendiente.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Casco', { exact: false })).toBeChecked();
  await expect(page.getByLabel('Cámara', { exact: false })).toBeChecked();
  await expect(page.getByText('1 ítem obligatorio pendiente.', { exact: true })).toBeVisible();
  await captura(page, info, 'equipo-movil-local');
});

test('HU-31: solo consulta en alerta y retorno disponible aunque falle equipo', async ({ page }, info) => {
  const c = await preparar(page);
  await asociar(page);
  c.plan.estado = 'alerta';
  await page.reload();
  await expect(page.getByLabel('Casco', { exact: false })).toBeDisabled();
  await expect(page.getByText('2 ítems obligatorios pendientes.', { exact: true })).toBeVisible();
  await captura(page, info, 'equipo-consulta-local');
  c.setFallaEquipo();
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText('Equipo temporalmente no disponible');
  await page.getByRole('link', { name: 'Ver expedición activa y retorno seguro', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Registrar retorno seguro', exact: true })).toBeEnabled();
  const consultas = c.consultasEquipo();
  await page.getByRole('button', { name: 'Registrar retorno seguro', exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: 'Confirmar retorno seguro' });
  await dialogo.getByLabel('Contraseña', { exact: true }).fill('Fixture123!');
  await dialogo.getByRole('button', { name: 'Registrar retorno seguro', exact: true }).click();
  await expect(page).toHaveURL('/senderista/expedicion/confirmada');
  expect(c.retornos()).toBe(1);
  expect(c.consultasEquipo()).toBe(consultas);
});
