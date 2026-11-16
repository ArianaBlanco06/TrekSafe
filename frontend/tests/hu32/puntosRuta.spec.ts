import { test, expect, type Page } from '@playwright/test';

const planId = 'b1d0d5c0-8327-4af1-9cc1-2e83ae7e0320';
const pointId = '42f581d6-8731-4fa6-8ace-e710b97c45f9';
const path = `/senderista/expedicion/${planId}/puntos`;
type Punto = { id: string; nombre: string; latitud: number; longitud: number; orden: number };
type Ruta = {
  expedicion: { id: string; estado: string; lugarInicio: string; lugarFin: string;
    coordenadasInicio: string | null; coordenadasFin: string | null; horaInicio: string; version: number; editable: boolean };
  puntos: Punto[];
};
type Escenario = {
  ruta: Ruta;
  guardados: Array<{ versionEsperada: number; puntos: Punto[] }>;
  modo: 'normal' | 'conflicto' | 'error-campos' | 'respuesta-perdida' | 'error-servidor' | 'expirada' | 'no-encontrada' | 'lento';
  lecturas: number;
  liberar: (() => void) | null;
};

async function preparar(page: Page, puntos: Punto[] = []): Promise<Escenario> {
  const estado: Escenario = {
    ruta: {
      expedicion: { id: planId, estado: 'programada', lugarInicio: 'Cebollapampa', lugarFin: 'Laguna 69',
        coordenadasInicio: '-9.04500, -77.60800', coordenadasFin: '-9.01050, -77.60420',
        horaInicio: '2099-11-15T12:00:00.000Z', version: 1, editable: true },
      puntos,
    }, guardados: [], modo: 'normal', lecturas: 0, liberar: null,
  };
  await page.addInitScript(() => {
    sessionStorage.setItem('treksafe:token', 'token-ficticio-hu32');
    sessionStorage.setItem('treksafe:usuario', JSON.stringify({ id: '11111111-1111-4111-8111-111111111111',
      correoElectronico: 'ficticio@example.invalid', rol: 'senderista', nombreCompleto: 'Senderista ficticio' }));
  });
  // Interceptar toda API: ninguna solicitud puede alcanzar Supabase o el backend real.
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/expediciones/activa')) return route.fulfill({ json: { expedicion: null } });
    if (url.pathname.endsWith('/expediciones')) return route.fulfill({ json: { expediciones: [{
      ...estado.ruta.expedicion, horaRetornoEstimada: '2099-11-15T18:00:00.000Z', minutosTolerancia: 30,
    }] } });
    if (!url.pathname.endsWith(`/expediciones/${planId}/puntos`)) return route.fulfill({ status: 404, json: { mensaje: 'Fixture no definido' } });
    if (route.request().method() === 'GET') {
      estado.lecturas++;
      if (estado.modo === 'no-encontrada') return route.fulfill({ status: 404, json: { codigo: 'NO_ENCONTRADO', mensaje: 'Expedición no encontrada' } });
      return route.fulfill({ json: structuredClone(estado.ruta) });
    }
    expect(route.request().headers().authorization).toBe('Bearer token-ficticio-hu32');
    const body = route.request().postDataJSON() as Escenario['guardados'][number];
    estado.guardados.push(body);
    if (estado.modo === 'conflicto') {
      estado.ruta = { ...estado.ruta, expedicion: { ...estado.ruta.expedicion, version: 2 },
        puntos: [{ id: pointId, nombre: 'Punto de otra sesión', latitud: -9.02, longitud: -77.6, orden: 1 }] };
      return route.fulfill({ status: 409, json: { codigo: 'VERSION_PLAN_OBSOLETA', mensaje: 'La expedición cambió. Vuelve a consultarla antes de guardar' } });
    }
    if (estado.modo === 'error-campos') return route.fulfill({ status: 400, json: {
      codigo: 'DATOS_PUNTOS_INVALIDOS', mensaje: 'Datos de puntos inválidos',
      detalles: { 'puntos.0.nombre': ['Nombre rechazado por el servidor'] },
    } });
    if (estado.modo === 'error-servidor') return route.fulfill({ status: 500, json: { mensaje: 'Error interno del servidor' } });
    if (estado.modo === 'expirada') {
      estado.ruta.expedicion.editable = false;
      estado.ruta.expedicion.estado = 'en_progreso';
      return route.fulfill({ status: 409, json: { codigo: 'EXPEDICION_NO_EDITABLE', mensaje: 'La expedición ya no permite cambios' } });
    }
    if (estado.modo === 'lento') await new Promise<void>(resolve => { estado.liberar = resolve; });
    estado.ruta = { ...estado.ruta, expedicion: { ...estado.ruta.expedicion, version: body.versionEsperada + 1 },
      puntos: body.puntos.map(p => ({ ...p, nombre: p.nombre.trim(),
        latitud: Number(p.latitud.toFixed(5)), longitud: Number(p.longitud.toFixed(5)) })).sort((a, b) => a.orden - b.orden) };
    if (estado.modo === 'respuesta-perdida') return route.abort('failed');
    return route.fulfill({ json: { mensaje: 'Puntos de ruta guardados', ...estado.ruta } });
  });
  return estado;
}

async function llenar(page: Page, nombre = 'Mirador', indice = 0) {
  const punto = page.getByRole('group').nth(indice);
  await punto.getByLabel('Nombre', { exact: true }).fill(nombre);
  await punto.getByLabel('Latitud', { exact: true }).fill('-9.030126');
  await punto.getByLabel('Longitud', { exact: true }).fill('-77.60634');
}

test('acceso desde el listado y extremos de solo lectura', async ({ page }) => {
  await preparar(page);
  await page.goto('/senderista/expedicion');
  await expect(page.getByRole('link', { name: 'Editar', exact: true }))
    .toHaveAttribute('href', `/expediciones/${planId}/editar`);
  await expect(page.getByRole('link', { name: /Revisar equipo de la expedición/ }))
    .toHaveAttribute('href', `/senderista/expedicion/${planId}/equipo`);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cancelar expedición' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Gestionar puntos' }).click();
  await expect(page).toHaveURL(path);
  await expect(page.getByRole('heading', { name: 'Puntos de la ruta' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Extremos de la ruta' })).toContainText('Cebollapampa');
  await expect(page.getByRole('region', { name: 'Extremos de la ruta' }).locator('input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar puntos', exact: true })).toBeDisabled();
});

test('cancelar desde el listado actualiza el estado y retira los tres controles de programada', async ({ page }) => {
  const estado = await preparar(page);
  let cancelaciones = 0;
  await page.route(`**/api/expediciones/${planId}/cancelar`, async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe('Bearer token-ficticio-hu32');
    const body = route.request().postDataJSON() as { operacionId: string; motivo: string };
    expect(body.operacionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.motivo).toBe('Cambio de planes');
    cancelaciones++;
    return route.fulfill({ json: { mensaje: 'Expedición cancelada',
      expedicion: { id: planId, estado: 'cancelada', version: 2 } } });
  });
  await page.goto('/senderista/expedicion');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByLabel('Motivo (opcional)').fill('Cambio de planes');
  await page.getByRole('button', { name: 'Cancelar expedición', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('cancelada');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Editar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Gestionar puntos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Revisar equipo de la expedición/ })).toBeVisible();
  expect(cancelaciones).toBe(1);
  expect(estado.guardados).toEqual([]);
});

test('agregar, editar, reordenar, guardar y recargar conserva IDs y orden', async ({ page }) => {
  const estado = await preparar(page);
  await page.goto(path);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Primer mirador');
  const idPrimero = await page.getByRole('group').first().getAttribute('data-punto-id');
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Descanso', 1);
  await page.getByRole('button', { name: 'Subir punto 2' }).click();
  await expect(page.getByRole('group').first().getByLabel('Nombre', { exact: true })).toHaveValue('Descanso');
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  expect(estado.guardados).toHaveLength(1);
  expect(estado.guardados[0].versionEsperada).toBe(1);
  expect(estado.guardados[0].puntos[1].id).toBe(idPrimero);
  expect(estado.guardados[0].puntos.map(p => p.orden)).toEqual([1, 2]);
  await expect(page.getByRole('group').nth(1).getByLabel('Latitud', { exact: true })).toHaveValue('-9.03013');
  await page.reload();
  await expect(page.getByRole('group')).toHaveCount(2);
  await expect(page.getByRole('group').nth(1)).toHaveAttribute('data-punto-id', idPrimero!);
});

test('validación local no envía campos vacíos, fuera de rango o nombres demasiado largos', async ({ page }) => {
  const estado = await preparar(page);
  await page.goto(path);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByText('Escribe un nombre de entre 1 y 100 caracteres')).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toBeFocused();
  await llenar(page, 'a'.repeat(101));
  await page.getByLabel('Latitud', { exact: true }).fill('0.50000001');
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByText('Escribe una latitud entre -18.5 y 0.5')).toBeVisible();
  expect(estado.guardados).toHaveLength(0);
  await llenar(page, 'Mirador');
  await page.getByLabel('Latitud', { exact: true }).fill('-9,03');
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  expect(estado.guardados[0].puntos[0].latitud).toBe(-9.03);
});

test('limite de 20 puntos y eliminación completa preserva los extremos', async ({ page }) => {
  const iniciales = Array.from({ length: 20 }, (_, i) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, '0')}`,
    nombre: `Parada ${i + 1}`, latitud: -9.03, longitud: -77.6, orden: i + 1 }));
  const estado = await preparar(page, iniciales);
  await page.goto(path);
  await expect(page.getByText('20 de 20 puntos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar punto' })).toBeDisabled();
  for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Quitar punto 1', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  expect(estado.guardados[0].puntos).toEqual([]);
  expect(estado.ruta.expedicion.lugarInicio).toBe('Cebollapampa');
});

test('errores del servidor aparecen junto al campo y conservan la edición', async ({ page }) => {
  const estado = await preparar(page);
  estado.modo = 'error-campos';
  await page.goto(path);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Mi parada');
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByText('Nombre rechazado por el servidor')).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Mi parada');
  await page.getByLabel('Nombre', { exact: true }).fill('Nombre corregido');
  await expect(page.getByText('Nombre rechazado por el servidor')).toHaveCount(0);
});

test('conflicto permite revisar y conservar la edición sin un reintento automático', async ({ page }) => {
  const estado = await preparar(page);
  estado.modo = 'conflicto';
  await page.goto(path);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Mi edición');
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardar puntos', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Mi edición');
  await page.getByRole('button', { name: 'Revisar lista del servidor' }).click();
  await expect(page.getByText('1. Punto de otra sesión')).toBeVisible();
  await page.getByRole('button', { name: 'Conservar mi edición' }).click();
  expect(estado.guardados).toHaveLength(1);
  estado.modo = 'normal';
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  expect(estado.guardados[1].versionEsperada).toBe(2);
  expect(estado.guardados[1].puntos[0].nombre).toBe('Mi edición');
});

test('respuesta perdida se recupera consultando la lista guardada sin duplicar puntos', async ({ page }) => {
  const estado = await preparar(page);
  estado.modo = 'respuesta-perdida';
  await page.goto(path);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Parada recuperable');
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByText(/No pudimos confirmar si el servidor recibió tus puntos/)).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Parada recuperable');
  await page.getByRole('button', { name: 'Revisar lista del servidor' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cargar puntos del servidor' }).click();
  await expect(page.getByText('Se cargaron los puntos actuales del servidor')).toBeVisible();
  expect(estado.guardados).toHaveLength(1);
  await expect(page.getByRole('group')).toHaveCount(1);
  await expect(page.getByRole('group')).toHaveAttribute('data-punto-id', estado.guardados[0].puntos[0].id);
});

test('pérdida y recuperación de conexión conserva la edición y requiere guardar explícitamente', async ({ page, context }) => {
  const estado = await preparar(page);
  await page.goto(path);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Conservar sin red');
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Guardar puntos', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Conservar sin red');
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Guardar puntos', exact: true })).toBeEnabled();
  expect(estado.guardados).toHaveLength(0);
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
});

test('guardado en curso bloquea cambios y solicitudes repetidas', async ({ page }) => {
  const estado = await preparar(page);
  estado.modo = 'lento';
  await page.goto(path);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page);
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardando puntos…' })).toBeDisabled();
  await expect(page.getByLabel('Nombre', { exact: true })).toBeDisabled();
  await expect.poll(() => estado.liberar !== null).toBe(true);
  estado.liberar!();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  expect(estado.guardados).toHaveLength(1);
});

test('expedición que ya inició conserva edición y bloquea nuevos guardados', async ({ page }) => {
  const estado = await preparar(page);
  estado.modo = 'expirada';
  await page.goto(path);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Edición conservada');
  await page.getByRole('button', { name: 'Guardar puntos', exact: true }).click();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Edición conservada');
  await expect(page.getByRole('button', { name: 'Guardar puntos', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Revisar lista del servidor' }).click();
  await expect(page.getByRole('heading', { name: 'Lista actual del servidor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conservar mi edición' })).toHaveCount(0);
});

test('plan no editable se consulta sin permitir mutaciones y 404 ofrece reintento', async ({ page }) => {
  const estado = await preparar(page, [{ id: pointId, nombre: 'Punto guardado', latitud: -9.03, longitud: -77.6, orden: 1 }]);
  estado.ruta.expedicion.editable = false;
  estado.ruta.expedicion.estado = 'completada';
  await page.goto(path);
  await expect(page.getByLabel('Nombre', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Agregar punto' })).toBeDisabled();
  estado.modo = 'no-encontrada';
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Expedición no encontrada');
  estado.modo = 'normal';
  await page.getByRole('button', { name: 'Reintentar carga' }).click();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Punto guardado');
});

test('diseño móvil y oscuro conserva campos y controles sin desbordamiento', async ({ page }, testInfo) => {
  await preparar(page, [{ id: pointId, nombre: 'Mirador de la quebrada', latitud: -9.03, longitud: -77.6, orden: 1 }]);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(path);
  await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).click();
  await expect(page.getByLabel('Nombre', { exact: true })).toBeFocused();
  const nombre = await page.getByLabel('Nombre', { exact: true }).boundingBox();
  const guardar = await page.getByRole('button', { name: 'Guardar puntos', exact: true }).boundingBox();
  expect(nombre && guardar && nombre.y + nombre.height <= guardar.y).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('editor-movil.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: testInfo.outputPath('editor-oscuro.png'), fullPage: true });
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Mirador de la quebrada');
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
