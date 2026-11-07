import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const planId = 'b1d0d5c0-8327-4af1-9cc1-2e83ae7e0320';
const path = `/senderista/expedicion/${planId}/puntos`;
const apiPath = `/api/expediciones/${planId}/puntos`;
const controlHeaders = { 'x-hu32-control': process.env.TREKSAFE_HU32_CONTROL_TOKEN! };
type Auth = { token: string; usuario: { id: string; correoElectronico: string; rol: string } };
type Punto = { id: string; nombre: string; latitud: number; longitud: number; orden: number };
type Snapshot = { plan: Record<string, unknown> & { version: number }; puntos: Array<Punto & { expedicion_id: string }>;
  contactos: unknown; acompanantes: unknown };
let owner: Auth;
let other: Auth;
let rescue: Auth;
const headers = (auth = owner) => ({ Authorization: `Bearer ${auth.token}` });
const point = (orden = 1, nombre = 'Mirador'): Punto => ({ id: randomUUID(), nombre, latitud: -9.03, longitud: -77.6, orden });

async function control(request: APIRequestContext, endpoint: string, data: unknown = {}) {
  const response = await request.post(`/__hu32__/${endpoint}`, { headers: controlHeaders, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response;
}
async function snapshot(request: APIRequestContext, id = planId): Promise<Snapshot> {
  const response = await request.get(`/__hu32__/snapshot/${id}`, { headers: controlHeaders });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function login(request: APIRequestContext, correoElectronico: string): Promise<Auth> {
  const response = await request.post('/api/auth/iniciar-sesion', { data: { correoElectronico, contrasena: 'Treksafe123!' } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function abrir(page: Page) {
  await page.addInitScript(auth => {
    if (!sessionStorage.getItem('treksafe:token')) {
      sessionStorage.setItem('treksafe:token', auth.token);
      sessionStorage.setItem('treksafe:usuario', JSON.stringify(auth.usuario));
    }
  }, owner);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Puntos de la ruta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar punto' })).toBeEnabled();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function llenar(page: Page, nombre = 'Mi punto', indice = 0) {
  const group = page.getByRole('group').nth(indice);
  await group.getByLabel('Nombre', { exact: true }).fill(nombre);
  await group.getByLabel('Latitud', { exact: true }).fill('-9.000005');
  await group.getByLabel('Longitud', { exact: true }).fill('-77.60634');
}
const saveButton = (page: Page) => page.getByRole('button', { name: 'Guardar puntos', exact: true });

test.beforeAll(async ({ request }) => {
  await control(request, 'reset');
  owner = await login(request, 'senderista@treksafe.pe');
  other = await login(request, 'otro@example.invalid');
  rescue = await login(request, 'rescatista@treksafe.pe');
});
test.beforeEach(async ({ request }) => { await control(request, 'reset'); });

test('navegador → API → SDK Supabase → PostgREST → SQL conserva ruta, IDs y orden', async ({ page, request }) => {
  const before = await snapshot(request);
  await abrir(page);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Mirador real');
  const firstId = await page.getByRole('group').first().getAttribute('data-punto-id');
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Descanso real', 1);
  await page.getByRole('button', { name: 'Subir punto 2' }).click();
  await saveButton(page).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  const after = await snapshot(request);
  expect(after.puntos.map(p => p.nombre)).toEqual(['Descanso real', 'Mirador real']);
  expect(after.puntos[1].id).toBe(firstId);
  expect(Number(after.puntos[0].latitud)).toBe(-9.00001);
  expect(after.plan.version).toBe(before.plan.version + 1);
  const stable = (plan: Snapshot['plan']) => Object.fromEntries(Object.entries(plan).filter(([k]) => !['version', 'actualizado_en'].includes(k)));
  expect(stable(after.plan)).toEqual(stable(before.plan));
  expect(after.contactos).toEqual(before.contactos);
  expect(after.acompanantes).toEqual(before.acompanantes);
  await page.reload();
  await expect(page.getByRole('group').nth(1)).toHaveAttribute('data-punto-id', firstId!);
  await page.getByRole('button', { name: 'Quitar punto 1', exact: true }).click();
  await page.getByRole('button', { name: 'Quitar punto 1', exact: true }).click();
  await saveButton(page).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  expect((await snapshot(request)).puntos).toEqual([]);
});

test('dos sesiones detectan un conflicto real y exigen revisión explícita', async ({ page, request }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Edición del navegador');
  const peer = await request.put(apiPath, { headers: headers(), data: { versionEsperada: 1, puntos: [point(1, 'Otra sesión')] } });
  expect(peer.status(), await peer.text()).toBe(200);
  await saveButton(page).click();
  await expect(page.getByText('La expedición cambió. Vuelve a consultarla antes de guardar')).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Edición del navegador');
  expect((await snapshot(request)).puntos[0].nombre).toBe('Otra sesión');
  await page.getByRole('button', { name: 'Revisar lista del servidor' }).click();
  await expect(page.getByText('1. Otra sesión')).toBeVisible();
  await page.getByRole('button', { name: 'Conservar mi edición' }).click();
  expect((await snapshot(request)).plan.version).toBe(2);
  await saveButton(page).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  expect((await snapshot(request)).puntos[0].nombre).toBe('Edición del navegador');
});

test('un fallo SQL posterior a las mutaciones revierte todo y conserva la edición', async ({ page, request }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'No perder este cambio');
  const before = await snapshot(request);
  await control(request, 'fallo', { activar: true });
  await saveButton(page).click();
  await expect(page.getByRole('alert')).toContainText('Error interno del servidor');
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('No perder este cambio');
  expect(await snapshot(request)).toEqual(before);
  await control(request, 'fallo', { activar: false });
  await page.getByRole('button', { name: 'Revisar lista del servidor' }).click();
  await expect(page.getByText('Sin puntos intermedios.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conservar mi edición' }).click();
  await saveButton(page).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  expect((await snapshot(request)).puntos[0].nombre).toBe('No perder este cambio');
});

test('JWT, roles, propiedad, límite y permisos se verifican en toda la cadena', async ({ request }) => {
  const before = await snapshot(request);
  expect((await request.get(apiPath)).status()).toBe(401);
  expect((await request.get(apiPath, { headers: { Authorization: 'Bearer invalido' } })).status()).toBe(401);
  expect((await request.get(apiPath, { headers: headers(rescue) })).status()).toBe(403);
  expect((await request.get(apiPath, { headers: headers(other) })).status()).toBe(404);
  for (const data of [
    { versionEsperada: 2_147_483_648, puntos: [] },
    { versionEsperada: 1, puntos: Array.from({ length: 21 }, (_, i) => point(i + 1)) },
    { versionEsperada: 1, puntos: [point()], senderistaId: other.usuario.id },
    { versionEsperada: 1, puntos: [{ ...point(), latitud: 0.500000001 }] },
  ]) {
    const response = await request.put(apiPath, { headers: headers(), data });
    expect(response.status(), await response.text()).toBe(400);
    expect((await response.json()).codigo).toBe('DATOS_PUNTOS_INVALIDOS');
  }
  const direct = await request.post('/rest/v1/rpc/treksafe_consultar_puntos_ruta', {
    data: { p_senderista_id: owner.usuario.id, p_expedicion_id: planId },
  });
  expect(direct.status()).toBe(401);
  expect(await snapshot(request)).toEqual(before);
});

test('la hora de salida y los estados impiden escribir sobre la base real', async ({ page, request }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Edición fuera de plazo');
  await control(request, 'estado', { estado: 'programada', salidaPasada: true });
  await saveButton(page).click();
  await expect(page.getByRole('alert')).toContainText('La hora de salida ya fue alcanzada');
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Edición fuera de plazo');
  await expect(saveButton(page)).toBeDisabled();
  expect((await snapshot(request)).puntos).toEqual([]);
  for (const estado of ['en_progreso', 'alerta', 'completada']) {
    await control(request, 'estado', { estado });
    const result = await request.put(apiPath, { headers: headers(), data: { versionEsperada: 1, puntos: [] } });
    expect(result.status()).toBe(409);
    expect((await result.json()).codigo).toBe('EXPEDICION_NO_EDITABLE');
  }
});

test('PWA activa no cachea puntos y conserva solo la edición abierta al perder red', async ({ page, context, request }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Guardado en SQL');
  await saveButton(page).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  const cacheados = await page.evaluate(async () => {
    const resultados: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) {
        if (/\/expediciones\/[^/]+\/puntos/.test(new URL(req.url).pathname)) resultados.push(req.url);
      }
    }
    return resultados;
  });
  expect(cacheados).toEqual([]);
  await page.getByLabel('Nombre', { exact: true }).fill('Edición sin red');
  await context.setOffline(true);
  await expect(saveButton(page)).toBeDisabled();
  const respuestaOffline = await page.evaluate(async endpoint => {
    try { return (await fetch(endpoint)).status; } catch { return 'sin-red'; }
  }, apiPath);
  expect(respuestaOffline).toBe('sin-red');
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Edición sin red');
  await context.setOffline(false);
  await expect(saveButton(page)).toBeEnabled();
  expect((await snapshot(request)).puntos[0].nombre).toBe('Guardado en SQL');
  await saveButton(page).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Puntos de la ruta' })).toBeVisible();
  await expect(page.getByRole('group')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reintentar carga' })).toBeDisabled();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reintentar carga' }).click();
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Edición sin red');
});

test('cambio de usuario no reutiliza puntos de la sesión anterior ni offline', async ({ page, context }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Privado del primer usuario');
  await saveButton(page).click();
  await expect(page.getByText('Puntos de ruta guardados', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByLabel('Correo electrónico', { exact: true }).fill('otro@example.invalid');
  await page.getByLabel('Contraseña', { exact: true }).fill('Treksafe123!');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL('/senderista');
  await context.setOffline(true);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Puntos de la ruta' })).toBeVisible();
  await expect(page.getByRole('group')).toHaveCount(0);
  await expect(page.getByText('Privado del primer usuario', { exact: true })).toHaveCount(0);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reintentar carga' }).click();
  await expect(page.getByRole('alert')).toContainText('Expedición no encontrada');
});

test('una respuesta perdida después del commit recupera los mismos puntos', async ({ page, request }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  await llenar(page, 'Commit confirmado en la base');
  // Interrumpir solo la entrega: route.fetch ejecuta el PUT real antes del corte.
  await page.route(`**${apiPath}`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await saveButton(page).click();
  await expect(page.getByText(/No pudimos confirmar si el servidor recibió tus puntos/)).toBeVisible();
  const committed = await snapshot(request);
  expect(committed.plan.version).toBe(2);
  expect(committed.puntos).toHaveLength(1);
  await page.getByRole('button', { name: 'Revisar lista del servidor' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cargar puntos del servidor' }).click();
  await expect(page.getByText('Se cargaron los puntos actuales del servidor')).toBeVisible();
  expect(await snapshot(request)).toEqual(committed);
  await expect(page.getByRole('group')).toHaveAttribute('data-punto-id', committed.puntos[0].id);
});

test('regresión: creación, contactos, ficha médica, retorno e historial siguen funcionando', async ({ request }) => {
  const medical = { tipoSangre: 'O+', alergias: 'Ficticia', condiciones: '', medicamentos: '', consentimientoFirmado: true };
  expect((await request.put('/api/usuario/ficha-medica', { headers: headers(), data: medical })).status()).toBe(200);
  const beforeMedical = await (await request.get('/api/usuario/ficha-medica', { headers: headers() })).json();
  const contact = await (await request.get('/api/usuario/contactos', { headers: headers() })).json();
  const data = { lugarInicio: 'Inicio de regresión', lugarFin: 'Destino de regresión',
    coordenadasInicio: '-9.04, -77.61', coordenadasFin: '-9.01, -77.6',
    horaInicio: '2099-12-01T12:00:00Z', horaRetornoEstimada: '2099-12-01T18:00:00Z',
    minutosTolerancia: 30, idsContactos: [contact.contactos[0].id], nombresAcompanantes: ['Acompañante ficticio'] };
  const invalid = await request.post('/api/expediciones', { headers: headers(), data: { ...data, coordenadasInicio: '40.7, -74.0' } });
  expect(invalid.status()).toBe(400);
  const created = await request.post('/api/expediciones', { headers: headers(), data });
  expect(created.status(), await created.text()).toBe(201);
  const id = (await created.json()).expedicion.id;
  const list = await (await request.get('/api/expediciones', { headers: headers() })).json();
  expect(list.expediciones.some((e: { id: string }) => e.id === id)).toBe(true);
  const puntos = [point()];
  const saved = await request.put(`/api/expediciones/${id}/puntos`, { headers: headers(), data: { versionEsperada: 1, puntos } });
  expect(saved.status(), await saved.text()).toBe(200);
  expect(await (await request.get('/api/usuario/ficha-medica', { headers: headers() })).json()).toEqual(beforeMedical);
  await control(request, 'estado', { id, estado: 'en_progreso', salidaPasada: true });
  const returned = await request.post(`/api/expediciones/${id}/confirmar-retorno`, { headers: headers(), data: { contrasena: 'Treksafe123!' } });
  expect(returned.status(), await returned.text()).toBe(200);
  const history = await (await request.get('/api/expediciones/historial', { headers: headers() })).json();
  expect(history.expediciones.some((e: { id: string }) => e.id === id)).toBe(true);
  const readonly = await (await request.get(`/api/expediciones/${id}/puntos`, { headers: headers() })).json();
  expect(readonly.expedicion.editable).toBe(false);
  expect(readonly.puntos[0].id).toBe(puntos[0].id);
});
